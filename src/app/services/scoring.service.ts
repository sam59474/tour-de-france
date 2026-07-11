import { Injectable } from '@angular/core';
import {
  AppConfig,
  TeamsData,
  StagesData,
  GcData,
  PlayerTeam,
  Stage,
  PlayerStageScore,
  StageScoreResult,
  PlayerPeriodScore,
  PeriodScoreResult,
  PlayerTotals,
} from '../models/models';

@Injectable({ providedIn: 'root' })
export class ScoringService {

  /**
   * Resolve the effective roster for a player on a given stage number.
   * Applies stageOverrides on top of the base team.
   */
  getEffectiveRoster(team: PlayerTeam, stageNumber: number): {
    elite: string | null;
    capitaine: string | null;
    coequipiers: string[];
    all: string[];
  } {
    let elite = team.elite;
    let capitaine = team.capitaine;
    let coequipiers = [...team.coequipiers];

    for (const override of team.stageOverrides) {
      if (override.stages.includes(stageNumber)) {
        if (override.elite !== undefined) elite = override.elite;
        if (override.capitaine !== undefined) capitaine = override.capitaine;
        // Only replace coequipiers if the override actually specifies them
        if (override.coequipiers && override.coequipiers.length > 0) {
          coequipiers = [...override.coequipiers];
        }
      }
    }

    const all = [elite, capitaine, ...coequipiers].filter((c): c is string => !!c);
    return { elite, capitaine, coequipiers, all };
  }

  /**
   * Compute stage scores for all players for a single completed stage.
   */
  computeStageScore(
    stage: Stage,
    periodTeams: PlayerTeam[],
    config: AppConfig
  ): StageScoreResult {
    const N = config.players.length;
    const { stageBase, stageWinBonus, stageRankFactor, dnfPosition } = {
      ...config.scoring,
      dnfPosition: config.dnfPosition,
    };

    const positionMap = new Map<string, number>();
    for (const r of stage.results) {
      positionMap.set(r.cyclist.toLowerCase(), r.position);
    }

    const stageWinner = stage.results.find(r => r.position === 1)?.cyclist.toLowerCase();

    // Build per-player data
    const playerData = periodTeams.map(team => {
      const roster = this.getEffectiveRoster(team, stage.stageNumber);
      const positions = roster.all.map(c => positionMap.get(c.toLowerCase()) ?? dnfPosition);

      // Top 3 positions (sorted ascending, take first 3)
      const sorted = [...positions].sort((a, b) => a - b);
      const topThree = sorted.slice(0, 3);
      const topThreeSum = topThree.reduce((s, p) => s + p, 0);

      const hasStageWin = stageWinner
        ? roster.all.some(c => c.toLowerCase() === stageWinner)
        : false;

      return { player: team.player, roster, positions, topThreeSum, hasStageWin };
    });

    // Rank players by topThreeSum (lower = better = rank 1), ties get the same rank
    const sorted = [...playerData].sort((a, b) => a.topThreeSum - b.topThreeSum);
    const rankMap = new Map<string, number>();
    sorted.forEach((p, i) => {
      // Find the rank of the first player with this same sum
      const firstWithSameSum = sorted.findIndex(s => s.topThreeSum === p.topThreeSum);
      rankMap.set(p.player, firstWithSameSum + 1);
    });

    const playerScores: PlayerStageScore[] = playerData.map(pd => {
      const P = rankMap.get(pd.player) ?? N;
      const W = pd.hasStageWin ? stageWinBonus : 0;
      const score = stageBase - (stageRankFactor / N) * (P - 1) + W;

      return {
        player: pd.player,
        cyclists: pd.roster.all,
        positions: pd.positions,
        topThreeSum: pd.topThreeSum,
        rank: P,
        hasStageWin: pd.hasStageWin,
        score: Math.round(score * 100) / 100,
      };
    });

    return { stageNumber: stage.stageNumber, playerScores };
  }

  /**
   * Count how many times a player has switched Capitaine up through (not including) the given periodId.
   */
  countCapitaineSwitches(player: string, upToPeriodId: number, teams: TeamsData): number {
    const playerPeriods = teams.periods
      .filter(p => p.periodId < upToPeriodId)
      .map(p => p.teams.find(t => t.player === player)?.capitaine ?? null);

    let switches = 0;
    for (let i = 1; i < playerPeriods.length; i++) {
      if (
        playerPeriods[i] !== null &&
        playerPeriods[i - 1] !== null &&
        playerPeriods[i] !== playerPeriods[i - 1]
      ) {
        switches++;
      }
    }
    return switches;
  }

  /**
   * Compute period scores for all players after a period ends.
   */
  computePeriodScore(
    periodId: number,
    teams: TeamsData,
    gc: GcData,
    config: AppConfig
  ): PeriodScoreResult {
    const N = config.players.length;
    const { periodCapitaineBase, periodCapitaineRankFactor, periodLoyaltyBonus } =
      config.scoring;

    const gcPeriod = gc.afterPeriod.find(p => p.periodId === periodId);
    const periodTeams = teams.periods.find(p => p.periodId === periodId)?.teams ?? [];

    const gcMap = new Map<string, number>();
    for (const s of gcPeriod?.standings ?? []) {
      gcMap.set(s.cyclist.toLowerCase(), s.position);
    }

    // Build per-player GC positions for Capitaines
    const playerData = periodTeams.map(team => {
      const gcPos = team.capitaine ? gcMap.get(team.capitaine.toLowerCase()) ?? null : null;
      const C = this.countCapitaineSwitches(team.player, periodId, teams);
      return { player: team.player, capitaine: team.capitaine, gcPos, C };
    });

    // Rank by GC position (lower = better = rank 1), ties get the same rank; null = last
    const withGc = playerData.filter(p => p.gcPos !== null);
    const sortedByGc = [...withGc].sort((a, b) => (a.gcPos ?? 9999) - (b.gcPos ?? 9999));
    const rankMap = new Map<string, number>();
    sortedByGc.forEach((p, i) => {
      const firstWithSamePos = sortedByGc.findIndex(s => s.gcPos === p.gcPos);
      rankMap.set(p.player, firstWithSamePos + 1);
    });
    // Players with no GC data get rank N
    playerData.filter(p => p.gcPos === null).forEach(p => rankMap.set(p.player, N));

    const playerScores: PlayerPeriodScore[] = playerData.map(pd => {
      const G = rankMap.get(pd.player) ?? N;
      const C = pd.C;
      // Score = (2 - C) * 75 + (150 - (150/N) * (G - 1))
      const loyaltyPart = (2 - C) * periodLoyaltyBonus;
      const gcPart = periodCapitaineBase - (periodCapitaineRankFactor / N) * (G - 1);
      const score = loyaltyPart + gcPart;

      return {
        player: pd.player,
        capitaine: pd.capitaine,
        capitaineGcPosition: pd.gcPos,
        gcRank: G,
        capitaineSwitches: C,
        score: Math.round(score * 100) / 100,
      };
    });

    return { periodId, playerScores };
  }

  /**
   * Compute full totals across all stages and periods.
   */
  computeTotals(
    stageScores: StageScoreResult[],
    periodScores: PeriodScoreResult[],
    config: AppConfig
  ): PlayerTotals[] {
    return config.players.map(player => {
      const stageEntries = stageScores.map(ss => ({
        stageNumber: ss.stageNumber,
        score: ss.playerScores.find(p => p.player === player)?.score ?? 0,
      }));

      const periodEntries = periodScores.map(ps => ({
        periodId: ps.periodId,
        score: ps.playerScores.find(p => p.player === player)?.score ?? 0,
      }));

      const stageTotal = stageEntries.reduce((s, e) => s + e.score, 0);
      const periodTotal = periodEntries.reduce((s, e) => s + e.score, 0);

      return {
        player,
        stageTotal: Math.round(stageTotal * 100) / 100,
        periodTotal: Math.round(periodTotal * 100) / 100,
        grandTotal: Math.round((stageTotal + periodTotal) * 100) / 100,
        stageScores: stageEntries,
        periodScores: periodEntries,
      };
    });
  }
}
