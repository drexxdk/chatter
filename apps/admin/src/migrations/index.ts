import * as migration_20261003_213905_initial from './20261003_213905_initial'
import * as migration_20261004_073831_add_room_slow_mode from './20261004_073831_add_room_slow_mode'
import * as migration_20261004_081000_add_moderator_role from './20261004_081000_add_moderator_role'

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
]
