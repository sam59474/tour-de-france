import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService, AllData } from '../../services/data.service';
import { ScoringService } from '../../services/scoring.service';
import { Stage, CyclistResult, PlayerStageScore, GcData } from '../../models/models';

interface CyclistEntry {
  cyclist: string;
  position: number | null;
  dnf: boolean;
}

interface GcEntry {
  cyclist: string;
  position: number | null;
}

@Component({
  selector: 'app-stage-entry',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './stage-entry.component.html',
  styleUrl: './stage-entry.component.scss',
})
export class StageEntryComponent implements OnInit {
  data: AllData | null = null;
  loading = true;
  error: string | null = null;

  activeTab: 'stages' | 'gc' = 'stages';

  // Stage entry
  selectedStageNumber: number = 1;
  cyclistEntries: CyclistEntry[] = [];
  preview: PlayerStageScore[] = [];
  saveMessage: string | null = null;

  // GC entry
  selectedGcPeriodId: number = 1;
  gcEntries: GcEntry[] = [];
  gcSaveMessage: string | null = null;

  constructor(
    private dataService: DataService,
    private scoringService: ScoringService
  ) {}

  ngOnInit(): void {
    this.dataService.loadAll().subscribe({
      next: data => {
        this.data = data;
        this.loading = false;
        const firstIncomplete = data.stages.stages.find(s => !s.completed);
        if (firstIncomplete) this.selectedStageNumber = firstIncomplete.stageNumber;
        this.loadStage();
        this.loadGc();
      },
      error: err => {
        this.error = 'Failed to load data: ' + err.message;
        this.loading = false;
      },
    });
  }

  // ── Stage tab ──────────────────────────────────────────────

  get stages(): Stage[] {
    return this.data?.stages.stages ?? [];
  }

  get selectedStage(): Stage | undefined {
    return this.stages.find(s => s.stageNumber === this.selectedStageNumber);
  }

  get allCyclistsForStage(): string[] {
    if (!this.data) return [];
    const stage = this.selectedStage;
    if (!stage) return [];
    const periodTeams = this.data.teams.periods.find(p => p.periodId === stage.periodId)?.teams ?? [];
    const set = new Set<string>();
    for (const team of periodTeams) {
      const roster = this.scoringService.getEffectiveRoster(team, stage.stageNumber);
      roster.all.forEach(c => set.add(c));
    }
    return [...set].sort();
  }

  loadStage(): void {
    const stage = this.selectedStage;
    if (!stage) return;
    const cyclists = this.allCyclistsForStage;
    if (stage.completed && stage.results.length > 0) {
      this.cyclistEntries = cyclists.map(c => {
        const existing = stage.results.find(r => r.cyclist.toLowerCase() === c.toLowerCase());
        return {
          cyclist: c,
          position: existing ? (existing.position === 9999 ? null : existing.position) : null,
          dnf: existing ? existing.position === 9999 : false,
        };
      });
    } else {
      this.cyclistEntries = cyclists.map(c => ({ cyclist: c, position: null, dnf: false }));
    }
    this.preview = [];
    this.saveMessage = null;
  }

  onStageChange(): void {
    this.loadStage();
  }

  onDnfToggle(entry: CyclistEntry): void {
    if (entry.dnf) entry.position = null;
  }

  computePreview(): void {
    if (!this.data || !this.selectedStage) return;
    const tempResults: CyclistResult[] = this.cyclistEntries
      .filter(e => e.dnf || e.position !== null)
      .map(e => ({ cyclist: e.cyclist, position: e.dnf ? 9999 : (e.position ?? 9999) }));
    const tempStage: Stage = { ...this.selectedStage, results: tempResults, completed: true };
    const periodTeams = this.data.teams.periods.find(p => p.periodId === tempStage.periodId)?.teams ?? [];
    const result = this.scoringService.computeStageScore(tempStage, periodTeams, this.data.config);
    this.preview = [...result.playerScores].sort((a, b) => b.score - a.score);
  }

  downloadStagesJson(): void {
    if (!this.data || !this.selectedStage) return;
    const updatedStages = this.data.stages.stages.map(s => {
      if (s.stageNumber !== this.selectedStageNumber) return s;
      return {
        ...s,
        completed: true,
        results: this.cyclistEntries
          .filter(e => e.dnf || e.position !== null)
          .map(e => ({ cyclist: e.cyclist, position: e.dnf ? 9999 : (e.position ?? 9999) })),
      };
    });
    this.downloadJson({ stages: updatedStages }, 'stages.json');
    this.saveMessage = '✅ stages.json downloaded — replace the file in public/data/ and push to GitHub.';
  }

  get hasAllPositions(): boolean {
    return this.cyclistEntries.every(e => e.dnf || e.position !== null);
  }

  // ── GC tab ─────────────────────────────────────────────────

  /** All unique Capitaines across all periods that have teams defined */
  get allCapitaines(): string[] {
    if (!this.data) return [];
    const set = new Set<string>();
    for (const period of this.data.teams.periods) {
      for (const team of period.teams) {
        if (team.capitaine) set.add(team.capitaine);
      }
    }
    return [...set].sort();
  }

  get gcPeriods() {
    return this.data?.config.periods ?? [];
  }

  get selectedGcPeriodName(): string {
    return this.data?.config.periods.find(p => p.id === this.selectedGcPeriodId)?.name ?? '';
  }

  loadGc(): void {
    if (!this.data) return;
    const capitaines = this.allCapitaines;
    const existing = this.data.gc.afterPeriod.find(p => p.periodId === this.selectedGcPeriodId);
    this.gcEntries = capitaines.map(c => {
      const found = existing?.standings.find(s => s.cyclist.toLowerCase() === c.toLowerCase());
      return { cyclist: c, position: found?.position ?? null };
    });
    this.gcSaveMessage = null;
  }

  onGcPeriodChange(): void {
    this.loadGc();
  }

  get gcPeriodHasStandings(): boolean {
    const existing = this.data?.gc.afterPeriod.find(p => p.periodId === this.selectedGcPeriodId);
    return (existing?.standings.length ?? 0) > 0;
  }

  get hasAllGcPositions(): boolean {
    return this.gcEntries.every(e => e.position !== null && e.position > 0);
  }

  downloadGcJson(): void {
    if (!this.data) return;
    const updatedAfterPeriod = this.data.gc.afterPeriod.map(p => {
      if (p.periodId !== this.selectedGcPeriodId) return p;
      return {
        ...p,
        standings: this.gcEntries
          .filter(e => e.position !== null)
          .map(e => ({ cyclist: e.cyclist, position: e.position as number })),
      };
    });
    this.downloadJson({ afterPeriod: updatedAfterPeriod }, 'gc.json');
    this.gcSaveMessage = '✅ gc.json downloaded — replace the file in public/data/ and push to GitHub.';
  }

  // ── Shared ─────────────────────────────────────────────────

  private downloadJson(data: object, filename: string): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  getRankClass(rank: number): string {
    return ['first', 'second', 'third'][rank - 1] ?? '';
  }

  stageTypeClass(type: string): string {
    return type.toLowerCase().replace(/\s+/g, '-');
  }
}
