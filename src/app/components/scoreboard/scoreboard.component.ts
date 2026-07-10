import { Component, OnInit } from '@angular/core';
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
})
export class ScoreboardComponent implements OnInit {
  data: AllData | null = null;
  loading = true;
  error: string | null = null;

  totals: PlayerTotals[] = [];
  stageScores: StageScoreResult[] = [];
  periodScores: PeriodScoreResult[] = [];

  copySuccess = false;
  selectedPeriod = 0; // 0 = all periods

  constructor(
    private dataService: DataService,
    private scoringService: ScoringService
  ) {}

  ngOnInit(): void {
    this.dataService.loadAll().subscribe({
      next: data => {
        this.data = data;
        this.computeScores();
        this.loading = false;
      },
      error: err => {
        this.error = 'Failed to load data. ' + err.message;
        this.loading = false;
      },
    });
  }

  computeScores(): void {
    if (!this.data) return;
    const { config, teams, stages, gc } = this.data;

    // Stage scores — only for completed stages
    this.stageScores = stages.stages
      .filter(s => s.completed)
      .map(stage => {
        const periodTeams =
          teams.periods.find(p => p.periodId === stage.periodId)?.teams ?? [];
        return this.scoringService.computeStageScore(stage, periodTeams, config);
      });

    // Period scores — only for periods with GC data
    this.periodScores = config.periods
      .filter(p => {
        const gcPeriod = gc.afterPeriod.find(g => g.periodId === p.id);
        return gcPeriod && gcPeriod.standings.length > 0;
      })
      .map(p =>
        this.scoringService.computePeriodScore(p.id, teams, gc, config)
      );

    this.totals = this.scoringService
      .computeTotals(this.stageScores, this.periodScores, config)
      .sort((a, b) => b.grandTotal - a.grandTotal);
  }

  get completedStages(): Stage[] {
    return this.data?.stages.stages.filter(s => s.completed) ?? [];
  }

  get periods(): PeriodConfig[] {
    return this.data?.config.periods ?? [];
  }

  get filteredStageScores(): StageScoreResult[] {
    if (this.selectedPeriod === 0) return this.stageScores;
    const period = this.data?.config.periods.find(p => p.id === this.selectedPeriod);
    if (!period) return [];
    return this.stageScores.filter(s => period.stages.includes(s.stageNumber));
  }

  playerHasStageWin(stageNumber: number, player: string): boolean {
    const stage = this.stageScores.find(s => s.stageNumber === stageNumber);
    return stage?.playerScores.find(p => p.player === player)?.hasStageWin ?? false;
  }

  getMedal(rank: number): string {
    return ['🥇', '🥈', '🥉'][rank - 1] ?? '';
  }

  getStageScore(player: string, stageNumber: number): number | null {
    const stage = this.stageScores.find(s => s.stageNumber === stageNumber);
    return stage?.playerScores.find(p => p.player === player)?.score ?? null;
  }

  getPeriodScore(player: string, periodId: number): number | null {
    const period = this.periodScores.find(p => p.periodId === periodId);
    return period?.playerScores.find(p => p.player === player)?.score ?? null;
  }

  getRankClass(rank: number): string {
    return ['first', 'second', 'third'][rank - 1] ?? '';
  }

  copyToClipboard(): void {
    if (!this.data) return;
    const text = this.buildSummaryText();
    navigator.clipboard.writeText(text).then(() => {
      this.copySuccess = true;
      setTimeout(() => (this.copySuccess = false), 3000);
    });
  }

  buildSummaryText(): string {
    if (!this.data) return '';
    const { stages } = this.data;
    const lastStage = stages.stages.filter(s => s.completed).at(-1);
    const lines: string[] = [];

    lines.push('🏆 Tour de France Fantasy — Famille Edition 2025');
    if (lastStage) {
      lines.push(`📍 After Stage ${lastStage.stageNumber}: ${lastStage.origin} → ${lastStage.destination}`);
    }
    lines.push('');
    lines.push('🏅 CLASSEMENT GÉNÉRAL');
    lines.push('─────────────────────');

    this.totals.forEach((t, i) => {
      const medal = this.getMedal(i + 1);
      lines.push(
        `${medal || (i + 1) + '.'} ${t.player.padEnd(10)} ${t.grandTotal.toFixed(0)} pts  (Étapes: ${t.stageTotal.toFixed(0)}  Périodes: ${t.periodTotal.toFixed(0)})`
      );
    });

    // Last stage breakdown
    const lastStageScore = this.stageScores.at(-1);
    if (lastStageScore) {
      lines.push('');
      lines.push(`📊 ÉTAPE ${lastStageScore.stageNumber} — SCORES`);
      lines.push('─────────────────────');
      const sorted = [...lastStageScore.playerScores].sort((a, b) => b.score - a.score);
      sorted.forEach(ps => {
        const win = ps.hasStageWin ? ' ⭐ VICTOIRE' : '';
        lines.push(`  ${ps.player.padEnd(10)} ${ps.score.toFixed(0)} pts${win}`);
      });
    }

    lines.push('');
    lines.push('Allez les coureurs 🚴');
    return lines.join('\n');
  }
}
