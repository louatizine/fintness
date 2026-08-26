import type { NavigatorScreenParams } from '@react-navigation/native';
import type { CardioIntensity } from './types/models';

export type GpsSeedKey = 'running' | 'cycling';

export type TodayStackParamList = {
  TodayHome: undefined;
  RunTracking: {
    exerciseId: string;
    exerciseName: string;
    seedKey: GpsSeedKey;
    weightKg: number | null;
    dayKey: string;
    setNumber: number;
    userProgramId?: string;
    programId?: string;
    dayIndex?: number;
    dayLabel?: string;
    intensity?: CardioIntensity;
  };
};

export type HistoryStackParamList = {
  HistoryHome: undefined;
  CardioRoute: { sessionId: string; setId: string };
};

export type CoachesStackParamList = {
  CoachHome: undefined;
  CoachDirectory: undefined;
  CoachProfile: { coachId: string };
  BecomeCoach: undefined;
  CoachInbox: undefined;
  CoachClients: undefined;
  CoachClientDetail: { athleteId: string; athleteLabel: string };
  CoachVideoUpload: undefined;
  CoachNutritionPlanCreate: undefined;
  CoachVideoPlayer: { videoId: string; coachId: string };
  AssignCoachProgram: { athleteId: string; athleteLabel: string; programId?: string };
};

export type RootTabs = {
  Today: NavigatorScreenParams<TodayStackParamList> | undefined;
  Nutrition: undefined;
  History: NavigatorScreenParams<HistoryStackParamList> | undefined;
  Progress: undefined;
  Coaches: NavigatorScreenParams<CoachesStackParamList> | undefined;
  Settings: undefined;
};
