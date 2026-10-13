import * as migration_20261003_213905_initial from './20261003_213905_initial'
import * as migration_20261004_073831_add_room_slow_mode from './20261004_073831_add_room_slow_mode'
import * as migration_20261004_081000_add_moderator_role from './20261004_081000_add_moderator_role'
import * as migration_20261012_180801_add_reports from './20261012_180801_add_reports'
import * as migration_20261012_190502_add_legal from './20261012_190502_add_legal'
import * as migration_20261013_052004_add_users from './20261013_052004_add_users'
import * as migration_20261013_135258_add_user_display_name_picture from './20261013_135258_add_user_display_name_picture'
import * as migration_20261013_144731_localize_room_text from './20261013_144731_localize_room_text'

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
]
