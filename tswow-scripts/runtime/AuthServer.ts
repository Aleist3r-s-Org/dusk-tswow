import { mpath, wfs } from "../util/FileSystem";
import { Connection, mysql } from "../util/MySQL";
import { ipaths } from "../util/Paths";
import { Process } from "../util/Process";
import { copyLibraryFiles, writeYamlToConf } from "../util/TCConfig";
import { commands } from "./Commands";
import { Realms } from "./Realms";
import { NodeConfig } from "./NodeConfig";

export namespace AuthServer {
    const authserver = new Process().showOutput(true);
    let connection: Connection|undefined = undefined;

    export function query(sql: string) {
        if(!connection) {
            throw new Error('Internal error: Auth database connection not initialized');
        } else {
            return connection.query(sql);
        }
    }

    export function isStarted() {
        return authserver.isRunning();
    }

    export function stop() {
        return authserver.stop();
    }

    export async function start(type: 'Release'|'Debug' = 'Release') {
        await stop();
        if(authserver.isRunning()) {
            throw new Error(`Something else started the auth server while it was stopping`);
        }

        wfs.copy(ipaths.tcAuthserverDist(type),ipaths.authConfig+'.dist');
        wfs.copy(ipaths.tcAuthserverDist(type),ipaths.authConfig);

        writeYamlToConf(ipaths.nodeYaml,ipaths.authConfig,{
            // authserver executes in coredata, so we need the .. prefix
            'MySQLExecutable':mpath('..',ipaths.rel(ipaths.mysqldExe))
        });

        await query('DELETE FROM realmlist;');
        await Promise.all(Realms.getRealms().map(x=>query(x.realmListSql())));
        copyLibraryFiles(type);

        authserver.startIn(ipaths.authRoot,
            wfs.absPath(ipaths.tcAuthServer(type)));
    }

    export async function initialize() {
        const auth = commands.addCommand('auth');
        connection = new Connection(NodeConfig.database_settings('auth'),'auth');
        await mysql.installAuth(connection);

        if(!process.argv.includes('noac')) {
            await start(process.argv.includes('debug')?'Debug':'Release');
        }

        auth.addCommand('stop','','Stops the local authserver',async (args)=>{
            await stop();
        });

        auth.addCommand('start','debug|release?','Starts the local authserver',async (args)=>{
            await start(args[0]=='debug'?'Debug':'Release');
        });
    }
}