import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService, AllData } from '../../services/data.service';
import { ScoringService } from '../../services/scoring.service';
import { PeriodConfig, PlayerTeam } from '../../models/models';

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

  constructor(
    private dataService: DataService,
    private scoringService: ScoringService
  ) {}

  ngOnInit(): void {
    this.dataService.loadAll().subscribe({
      next: data => {
        this.data = data;
        this.loading = false;
      },
      error: err => {
        this.error = 'Failed to load data: ' + err.message;
        this.loading = false;
      },
    });
  }

  get periods(): PeriodConfig[] {
    return this.data?.config.periods ?? [];
  }

  get selectedPeriod(): PeriodConfig | undefined {
    return this.periods.find(p => p.id === this.selectedPeriodId);
  }

  get teamsForPeriod(): PlayerTeam[] {
    return this.data?.teams.periods.find(p => p.periodId === this.selectedPeriodId)?.teams ?? [];
  }

  isElite(cyclist: string): boolean {
    return this.data?.config.elites.includes(cyclist) ?? false;
  }

  getCapitaineSwitches(player: string): number {
    if (!this.data) return 0;
    return this.scoringService.countCapitaineSwitches(player, this.selectedPeriodId, this.data.teams);
  }

  getEffectiveRosterForStage(team: PlayerTeam, stageNumber: number) {
    return this.scoringService.getEffectiveRoster(team, stageNumber);
  }

  hasOverrides(team: PlayerTeam): boolean {
    return team.stageOverrides.length > 0;
  }
}
