import * as migration_20261003_213905_initial from './20261003_213905_initial'

export const migrations = [
  {
    up: migration_20261003_213905_initial.up,
    down: migration_20261003_213905_initial.down,
    name: '20261003_213905_initial',
  },
]
