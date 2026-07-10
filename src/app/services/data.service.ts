import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, map } from 'rxjs';
import { AppConfig, TeamsData, StagesData, GcData } from '../models/models';

export interface AllData {
  config: AppConfig;
  teams: TeamsData;
  stages: StagesData;
  gc: GcData;
}

@Injectable({ providedIn: 'root' })
export class DataService {
  constructor(private http: HttpClient) {}

  loadAll(): Observable<AllData> {
    return forkJoin({
      config: this.http.get<AppConfig>('data/config.json'),
      teams: this.http.get<TeamsData>('data/teams.json'),
      stages: this.http.get<StagesData>('data/stages.json'),
      gc: this.http.get<GcData>('data/gc.json'),
    });
  }
}
