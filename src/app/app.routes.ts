import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/scoreboard/scoreboard.component').then(m => m.ScoreboardComponent),
  },
  {
    path: 'stage-entry',
    loadComponent: () =>
      import('./components/stage-entry/stage-entry.component').then(m => m.StageEntryComponent),
  },
  {
    path: 'teams',
    loadComponent: () =>
      import('./components/team-setup/team-setup.component').then(m => m.TeamSetupComponent),
  },
  { path: '**', redirectTo: '' },
];
