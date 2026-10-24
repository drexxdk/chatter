import * as migration_20261003_213905_initial from './20261003_213905_initial'
import * as migration_20261004_073831_add_room_slow_mode from './20261004_073831_add_room_slow_mode'
import * as migration_20261004_081000_add_moderator_role from './20261004_081000_add_moderator_role'
import * as migration_20261012_180801_add_reports from './20261012_180801_add_reports'
import * as migration_20261012_190502_add_legal from './20261012_190502_add_legal'
import * as migration_20261013_052004_add_users from './20261013_052004_add_users'
import * as migration_20261013_135258_add_user_display_name_picture from './20261013_135258_add_user_display_name_picture'
import * as migration_20261013_144731_localize_room_text from './20261013_144731_localize_room_text'
import * as migration_20261018_201837_add_user_name_claims from './20261018_201837_add_user_name_claims'
import * as migration_20261019_174937_add_user_password from './20261019_174937_add_user_password'
import * as migration_20261022_145536_add_user_birth_date from './20261022_145536_add_user_birth_date'
import * as migration_20261023_144212_add_notification_preferences from './20261023_144212_add_notification_preferences'
import * as migration_20261024_131639_add_roadmap_releases from './20261024_131639_add_roadmap_releases'
import * as migration_20261024_155419_allow_duplicate_display_names from './20261024_155419_allow_duplicate_display_names'
import * as migration_20261024_162032_add_display_name_cooldown from './20261024_162032_add_display_name_cooldown'
import * as migration_20261024_202458_retire_website_collections from './20261024_202458_retire_website_collections'

export const migrations = [
  {
    up: migration_20261003_213905_initial.up,
    down: migration_20261003_213905_initial.down,
    name: '20261003_213905_initial',
  },
  {
    up: migration_20261004_073831_add_room_slow_mode.up,
    down: migration_20261004_073831_add_room_slow_mode.down,
    name: '20261004_073831_add_room_slow_mode',
  },
  {
    up: migration_20261004_081000_add_moderator_role.up,
    down: migration_20261004_081000_add_moderator_role.down,
    name: '20261004_081000_add_moderator_role',
  },
  {
    up: migration_20261012_180801_add_reports.up,
    down: migration_20261012_180801_add_reports.down,
    name: '20261012_180801_add_reports',
  },
  {
    up: migration_20261012_190502_add_legal.up,
    down: migration_20261012_190502_add_legal.down,
    name: '20261012_190502_add_legal',
  },
  {
    up: migration_20261013_052004_add_users.up,
    down: migration_20261013_052004_add_users.down,
    name: '20261013_052004_add_users',
  },
  {
    up: migration_20261013_135258_add_user_display_name_picture.up,
    down: migration_20261013_135258_add_user_display_name_picture.down,
    name: '20261013_135258_add_user_display_name_picture',
  },
  {
    up: migration_20261013_144731_localize_room_text.up,
    down: migration_20261013_144731_localize_room_text.down,
    name: '20261013_144731_localize_room_text',
  },
  {
    up: migration_20261018_201837_add_user_name_claims.up,
    down: migration_20261018_201837_add_user_name_claims.down,
    name: '20261018_201837_add_user_name_claims',
  },
  {
    up: migration_20261019_174937_add_user_password.up,
    down: migration_20261019_174937_add_user_password.down,
    name: '20261019_174937_add_user_password',
  },
  {
    up: migration_20261022_145536_add_user_birth_date.up,
    down: migration_20261022_145536_add_user_birth_date.down,
    name: '20261022_145536_add_user_birth_date',
  },
  {
    up: migration_20261023_144212_add_notification_preferences.up,
    down: migration_20261023_144212_add_notification_preferences.down,
    name: '20261023_144212_add_notification_preferences',
  },
  {
    up: migration_20261024_131639_add_roadmap_releases.up,
    down: migration_20261024_131639_add_roadmap_releases.down,
    name: '20261024_131639_add_roadmap_releases',
  },
  {
    up: migration_20261024_155419_allow_duplicate_display_names.up,
    down: migration_20261024_155419_allow_duplicate_display_names.down,
    name: '20261024_155419_allow_duplicate_display_names',
  },
  {
    up: migration_20261024_162032_add_display_name_cooldown.up,
    down: migration_20261024_162032_add_display_name_cooldown.down,
    name: '20261024_162032_add_display_name_cooldown',
  },
  {
    up: migration_20261024_202458_retire_website_collections.up,
    down: migration_20261024_202458_retire_website_collections.down,
    name: '20261024_202458_retire_website_collections',
  },
]
