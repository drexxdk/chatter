export type NotificationSoundId = "chime" | "bell" | "pulse" | "wood";
export type NotificationKind = "private" | "warnings" | "joins";
export interface NotificationChannel {
  enabled: boolean;
  sound: NotificationSoundId;
}
export interface NotificationSoundPreferences {
  enabled: boolean;
  volume: number;
  sound?: NotificationSoundId;
  warnings?: NotificationChannel;
  joins?: NotificationChannel;
}
export const NOTIFICATION_SOUNDS: readonly NotificationSoundId[];
export const NOTIFICATION_KINDS: readonly NotificationKind[];
export function parseNotificationPreferences(
  value: unknown,
): NotificationSoundPreferences | undefined;
export function notificationChannel(
  preferences: NotificationSoundPreferences,
  kind: NotificationKind,
): NotificationChannel;
