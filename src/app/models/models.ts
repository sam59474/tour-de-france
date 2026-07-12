export interface AppConfig {
  players: string[];
  elites: string[];
  periods: PeriodConfig[];
  dnfPosition: number;
  scoring: ScoringConfig;
}

export interface ScoringConfig {
  stageBase: number;
  stageWinBonus: number;
  stageRankFactor: number;
  periodCapitaineBase: number;
  periodCapitaineRankFactor: number;
  periodLoyaltyBonus: number;
}

export interface PeriodConfig {
  id: number;
  name: string;
  subtitle: string;
  stages: number[];
  dates: string;
}

// teams.json
export interface TeamsData {
  periods: PeriodTeams[];
}

export interface PeriodTeams {
  periodId: number;
  teams: PlayerTeam[];
}

export interface PlayerTeam {
  player: string;
  elite: string | null;
  capitaine: string | null;
  coequipiers: string[];
  stageOverrides: StageOverride[];
}

export interface StageOverride {
  stages: number[];
  coequipiers: string[];
  elite?: string;
  capitaine?: string;
}

// stages.json
export interface StagesData {
  stages: Stage[];
}

export interface Stage {
  stageNumber: number;
  periodId: number;
  date: string;
  name: string;
  origin: string;
  destination: string;
  distance: string;
  type: 'Flat' | 'Hilly' | 'Mountainous' | 'Individual Time Trial' | 'Team Time Trial';
  completed: boolean;
  results: CyclistResult[];
}

export interface CyclistResult {
  cyclist: string;
  position: number; // 9999 = DNF/DNS
}

// gc.json
export interface GcData {
  afterPeriod: PeriodGc[];
}

export interface PeriodGc {
  periodId: number;
  standings: GcStanding[];
}

export interface GcStanding {
  cyclist: string;
  position: number;
}

// Computed scoring types
export interface PlayerStageScore {
  player: string;
  cyclists: string[];
  positions: number[];
  topThreeSum: number;
  rank: number; // P
  hasStageWin: boolean;
  score: number;
}

export interface StageScoreResult {
  stageNumber: number;
  playerScores: PlayerStageScore[];
}

export interface PlayerPeriodScore {
  player: string;
  capitaine: string | null;
  capitaineGcPosition: number | null;
  gcRank: number; // G
  capitaineSwitches: number; // C
  score: number;
}

export interface PeriodScoreResult {
  periodId: number;
  playerScores: PlayerPeriodScore[];
}

export interface PlayerTotals {
  player: string;
  stageTotal: number;
  periodTotal: number;
  grandTotal: number;
  stageScores: { stageNumber: number; score: number }[];
  periodScores: { periodId: number; score: number }[];
}
