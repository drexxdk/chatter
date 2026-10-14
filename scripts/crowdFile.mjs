// Where `npm run crowd` and the scripts that steer it (crowd:pause, crowd:resume, crowd:stop) meet: the running crowd writes
// its process id here and reads what it is told to do.
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CONTROL_FILE = join(tmpdir(), "chatter-crowd.json");
