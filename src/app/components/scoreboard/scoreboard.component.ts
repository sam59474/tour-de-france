import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService, AllData } from '../../services/data.service';
import { ScoringService } from '../../services/scoring.service';
import {
  PlayerTotals,
  StageScoreResult,
  PeriodScoreResult,
  Stage,
  PeriodConfig,
} from '../../models/models';

@Component({
  selector: 'app-scoreboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scoreboard.component.html',
  styleUrl: './scoreboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoreboardComponent implements OnInit {
  data: AllData | null = null;
  loading = true;
  error: string | null = null;

  totals: PlayerTotals[] = [];
  stageScores: StageScoreResult[] = [];
  periodScores: PeriodScoreResult[] = [];

  // Pre-built lookup tables so the template never calls find() in a loop
  stageScoreMap = new Map<number, Map<string, number>>();    // stageNumber -> player -> score
  stageWinMap   = new Map<number, Set<string>>();            // stageNumber -> players with win
  periodScoreMap = new Map<number, Map<string, number>>();   // periodId -> player -> score

  copySuccess = false;

  private _selectedPeriod = 0;
  filteredStageScores: StageScoreResult[] = [];

  get selectedPeriod(): number { return this._selectedPeriod; }
  set selectedPeriod(v: number) {
    this._selectedPeriod = v;
    this.updateFilteredStages();
    this.cdr.markForCheck();
  }

  constructor(
    private dataService: DataService,
    private scoringService: ScoringService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.dataService.loadAll().subscribe({
      next: data => {
        this.data = data;
        this.computeScores();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.error = 'Failed to load data. ' + err.message;
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  computeScores(): void {
    if (!this.data) return;
    const { config, teams, stages, gc } = this.data;

    this.stageScores = stages.stages
      .filter(s => s.completed)
      .map(stage => {
        const periodTeams = teams.periods.find(p => p.periodId === stage.periodId)?.teams ?? [];
        return this.scoringService.computeStageScore(stage, periodTeams, config);
      });

    this.periodScores = config.periods
      .filter(p => {
        const gcPeriod = gc.afterPeriod.find(g => g.periodId === p.id);
        return gcPeriod && gcPeriod.standings.length > 0;
      })
      .map(p => this.scoringService.computePeriodScore(p.id, teams, gc, config));

    this.totals = this.scoringService
      .computeTotals(this.stageScores, this.periodScores, config)
      .sort((a, b) => b.grandTotal - a.grandTotal);

    // Build lookup maps so the template does O(1) lookups instead of .find() loops
    this.stageScoreMap.clear();
    this.stageWinMap.clear();
    for (const ss of this.stageScores) {
      const scoresByPlayer = new Map<string, number>();
      const winners = new Set<string>();
      for (const ps of ss.playerScores) {
        scoresByPlayer.set(ps.player, ps.score);
        if (ps.hasStageWin) winners.add(ps.player);
      }
      this.stageScoreMap.set(ss.stageNumber, scoresByPlayer);
      this.stageWinMap.set(ss.stageNumber, winners);
    }

    this.periodScoreMap.clear();
    for (const ps of this.periodScores) {
      const scoresByPlayer = new Map<string, number>();
      for (const p of ps.playerScores) scoresByPlayer.set(p.player, p.score);
      this.periodScoreMap.set(ps.periodId, scoresByPlayer);
    }

    this.updateFilteredStages();
  }

  private updateFilteredStages(): void {
    if (this._selectedPeriod === 0) {
      this.filteredStageScores = this.stageScores;
    } else {
      const period = this.data?.config.periods.find(p => p.id === this._selectedPeriod);
      this.filteredStageScores = period
        ? this.stageScores.filter(s => period.stages.includes(s.stageNumber))
        : [];
    }
  }

  get periods(): PeriodConfig[] {
    return this.data?.config.periods ?? [];
  }

  getStageScore(player: string, stageNumber: number): number {
    return this.stageScoreMap.get(stageNumber)?.get(player) ?? 0;
  }

  playerHasStageWin(stageNumber: number, player: string): boolean {
    return this.stageWinMap.get(stageNumber)?.has(player) ?? false;
  }

  getPeriodScore(player: string, periodId: number): number {
    return this.periodScoreMap.get(periodId)?.get(player) ?? 0;
  }

  getMedal(rank: number): string {
    return ['🥇', '🥈', '🥉'][rank - 1] ?? '';
  }

  getRankClass(rank: number): string {
    return ['first', 'second', 'third'][rank - 1] ?? '';
  }

  copyToClipboard(): void {
    if (!this.data) return;
    const text = this.buildSummaryText();
    navigator.clipboard.writeText(text).then(() => {
      this.copySuccess = true;
      this.cdr.markForCheck();
      setTimeout(() => { this.copySuccess = false; this.cdr.markForCheck(); }, 3000);
    });
  }

  buildSummaryText(): string {
    if (!this.data) return '';
    const { stages } = this.data;
    const lastStage = stages.stages.filter(s => s.completed).at(-1);
    const lines: string[] = [];

    if (lastStage) {
      lines.push(`📍 After Stage ${lastStage.stageNumber}: ${lastStage.origin} → ${lastStage.destination}, ${lastStage.distance}, ${lastStage.type}`);
    }

    const lastStageScore = this.stageScores.at(-1);
    if (lastStageScore) {
      lines.push('');
      lines.push(`📊 STAGE ${lastStageScore.stageNumber} — SCORES`);
      lines.push('─────────────────────');
      const sorted = [...lastStageScore.playerScores].sort((a, b) => b.score - a.score);
      sorted.forEach(ps => {
        const win = ps.hasStageWin ? ' ⭐ STAGE WIN' : '';
        lines.push(`  ${ps.player.padEnd(10)} ${ps.score.toFixed(0)} pts${win}`);
      });
    }

    lines.push('');
    lines.push('🏅 OVERALL STANDINGS');
    lines.push('─────────────────────');

    this.totals.forEach((t, i) => {
      const medal = this.getMedal(i + 1);
      lines.push(
        `${medal || (i + 1) + '.'} ${t.player.padEnd(10)} ${t.grandTotal.toFixed(0)} pts  (Stages: ${t.stageTotal.toFixed(0)}  Periods: ${t.periodTotal.toFixed(0)})`
      );
    });

    lines.push('');
    const nextStage = stages.stages.filter(s => !s.completed).at(0);
    if (nextStage) {
      lines.push(`📍 Next Stage ${nextStage.stageNumber}: ${nextStage.origin} → ${nextStage.destination}, ${nextStage.distance}, ${nextStage.type}`);
    }

    lines.push('');
    lines.push('Allez les coureurs 🚴');
    return lines.join('\n');
  }
}
