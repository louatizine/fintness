import type { NavigatorScreenParams } from '@react-navigation/native';

export type CoachesStackParamList = {
  CoachHome: undefined;
  CoachDirectory: undefined;
  CoachProfile: { coachId: string };
  BecomeCoach: undefined;
  CoachInbox: undefined;
  CoachClients: undefined;
  CoachClientDetail: { athleteId: string; athleteLabel: string };
  CoachVideoUpload: undefined;
  CoachVideoPlayer: { videoId: string; coachId: string };
  AssignCoachProgram: { athleteId: string; athleteLabel: string; programId?: string };
};

export type RootTabs = {
  Today: undefined;
  Nutrition: undefined;
  History: undefined;
  Progress: undefined;
  Coaches: NavigatorScreenParams<CoachesStackParamList> | undefined;
  Settings: undefined;
};
