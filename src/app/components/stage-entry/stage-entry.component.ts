import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService, AllData } from '../../services/data.service';
import { ScoringService } from '../../services/scoring.service';
import { Stage, CyclistResult, PlayerStageScore, PlayerTeam } from '../../models/models';

interface CyclistEntry {
  cyclist: string;
  position: number | null;
  dnf: boolean;
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

  selectedStageNumber: number = 1;
  cyclistEntries: CyclistEntry[] = [];
  preview: PlayerStageScore[] = [];
  saveMessage: string | null = null;

  constructor(
    private dataService: DataService,
    private scoringService: ScoringService
  ) {}

  ngOnInit(): void {
    this.dataService.loadAll().subscribe({
      next: data => {
        this.data = data;
        this.loading = false;
        // Default to the first incomplete stage
        const firstIncomplete = data.stages.stages.find(s => !s.completed);
        if (firstIncomplete) this.selectedStageNumber = firstIncomplete.stageNumber;
        this.loadStage();
      },
      error: err => {
        this.error = 'Failed to load data: ' + err.message;
        this.loading = false;
      },
    });
  }

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
      // Pre-fill with existing results
      this.cyclistEntries = cyclists.map(c => {
        const existing = stage.results.find(
          r => r.cyclist.toLowerCase() === c.toLowerCase()
        );
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
      .map(e => ({
        cyclist: e.cyclist,
        position: e.dnf ? 9999 : (e.position ?? 9999),
      }));

    const tempStage: Stage = {
      ...this.selectedStage,
      results: tempResults,
      completed: true,
    };

    const periodTeams =
      this.data.teams.periods.find(p => p.periodId === tempStage.periodId)?.teams ?? [];

    const result = this.scoringService.computeStageScore(tempStage, periodTeams, this.data.config);
    this.preview = [...result.playerScores].sort((a, b) => b.score - a.score);
  }

  getDownloadData(): string {
    if (!this.data || !this.selectedStage) return '';

    const updatedStages = this.data.stages.stages.map(s => {
      if (s.stageNumber !== this.selectedStageNumber) return s;
      return {
        ...s,
        completed: true,
        results: this.cyclistEntries
          .filter(e => e.dnf || e.position !== null)
          .map(e => ({
            cyclist: e.cyclist,
            position: e.dnf ? 9999 : (e.position ?? 9999),
          })),
      };
    });

    return JSON.stringify({ stages: updatedStages }, null, 2);
  }

  downloadStagesJson(): void {
    const content = this.getDownloadData();
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stages.json';
    a.click();
    URL.revokeObjectURL(url);
    this.saveMessage = '✅ stages.json téléchargé — remplace le fichier dans public/data/ et pousse sur GitHub.';
  }

  get hasAllPositions(): boolean {
    return this.cyclistEntries.every(e => e.dnf || e.position !== null);
  }

  getRankClass(rank: number): string {
    return ['first', 'second', 'third'][rank - 1] ?? '';
  }
}
