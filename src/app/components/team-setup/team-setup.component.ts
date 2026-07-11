import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService, AllData } from '../../services/data.service';
import { ScoringService } from '../../services/scoring.service';
import { PeriodConfig, PlayerTeam, Stage } from '../../models/models';

@Component({
  selector: 'app-team-setup',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './team-setup.component.html',
  styleUrl: './team-setup.component.scss',
})
export class TeamSetupComponent implements OnInit {
  data: AllData | null = null;
  loading = true;
  error: string | null = null;

  selectedPeriodId = 1;
  periods: PeriodConfig[] = [];
  selectedPeriod: PeriodConfig | null = null;
  teamsForPeriod: PlayerTeam[] = [];
  stagesForPeriod: Stage[] = [];
  copySuccess = false;

  constructor(
    private dataService: DataService,
    private scoringService: ScoringService
  ) {}

  ngOnInit(): void {
    this.dataService.loadAll().subscribe({
      next: data => {
        this.data = data;
        this.periods = data.config.periods;
        this.loading = false;
        this.updateView();
      },
      error: err => {
        this.error = 'Failed to load data: ' + err.message;
        this.loading = false;
      },
    });
  }

  onPeriodSelect(id: number): void {
    this.selectedPeriodId = id;
    this.updateView();
  }

  private updateView(): void {
    if (!this.data) return;

    this.selectedPeriod = this.data.config.periods.find(p => p.id === this.selectedPeriodId) ?? null;

    const teams = this.data.teams.periods.find(p => p.periodId === this.selectedPeriodId)?.teams ?? [];
    this.teamsForPeriod = [...teams].sort((a, b) => a.player.localeCompare(b.player));

    const stageNums = this.selectedPeriod?.stages ?? [];
    this.stagesForPeriod = this.data.stages.stages.filter(s => stageNums.includes(s.stageNumber));
  }

  stageTypeClass(type: string): string {
    return type.toLowerCase().replace(/\s+/g, '-');
  }

  isElite(cyclist: string): boolean {
    return this.data?.config.elites.includes(cyclist) ?? false;
  }

  getCapitaineSwitches(player: string): number {
    if (!this.data) return 0;
    return this.scoringService.countCapitaineSwitches(player, this.selectedPeriodId, this.data.teams);
  }

  hasOverrides(team: PlayerTeam): boolean {
    return team.stageOverrides.length > 0;
  }

  copyToClipboard(): void {
    const text = this.buildTeamsSummary();
    navigator.clipboard.writeText(text).then(() => {
      this.copySuccess = true;
      setTimeout(() => (this.copySuccess = false), 3000);
    });
  }

  private buildTeamsSummary(): string {
    if (!this.selectedPeriod) return '';
    const lines: string[] = [];
    lines.push(`🚴 Tour de France Fantasy — ${this.selectedPeriod.name}`);
    lines.push(`${this.selectedPeriod.subtitle} · ${this.selectedPeriod.dates}`);
    lines.push('─────────────────────');

    for (const team of this.teamsForPeriod) {
      if (!team.elite) {
        lines.push(`\n${team.player}: Team TBD`);
        continue;
      }
      lines.push(`\n${team.player}`);
      lines.push(`  ⭐ Élite: ${team.elite}`);
      lines.push(`  🎖️ Capitaine: ${team.capitaine}`);
      lines.push(`  🤝 Coéquipiers: ${team.coequipiers.join(', ')}`);
      if (team.stageOverrides.length > 0) {
        for (const ov of team.stageOverrides) {
          const parts: string[] = [];
          if (ov.elite) parts.push(`Élite → ${ov.elite}`);
          if (ov.capitaine) parts.push(`Capitaine → ${ov.capitaine}`);
          if (ov.coequipiers?.length) parts.push(`Coéquipiers → ${ov.coequipiers.join(', ')}`);
          lines.push(`  🔄 Stages ${ov.stages.join(', ')}: ${parts.join(', ')}`);
        }
      }
    }

    lines.push('\nAllez les coureurs 🚴');
    return lines.join('\n');
  }
}
