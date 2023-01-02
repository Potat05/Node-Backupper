
const fs = require('fs');
const PATH = require('path');
const settings = require('./settings.json');
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});



class PathList {

    /** @type {string[]} */
    include = [];
    /** @type {string[]} */
    exclude = [];



    /**
     * gets all files in pathlist  
     * @returns {{ files: string[], totalSize: number }}  
     */
    getList() {

        for(let exclude of this.exclude) {
            console.log(exclude);
        }

        /** @type {string[]} */
        let files = [];

        let totalSize = 0;

        /**
         * @param {string[]} entries 
         */
        const forEachEntry = (entries=[]) => {
            for(const entry of entries) {
                if(this.exclude.some(exclude => {
                    return entry.startsWith(exclude);
                })) continue;

                const stats = fs.statSync(entry);

                if(stats.isFile()) {
                    files.push(entry);
                    totalSize += stats.size;
                } else if(stats.isDirectory()) {
                    forEachEntry(fs.readdirSync(entry).map(path => `${entry}\\${path}`));
                }
            }
        }

        forEachEntry(this.include);

        return { files, totalSize };

    }



    /**
     * Loads file and parses it to a PathList.  
     * @param {string} filepath  
     * @returns {PathList}  
     */
    static loadFile(filepath) {

        const data = fs.readFileSync(filepath, { encoding: 'ascii' });
        const lines = data.split('\n').map(line => line.trimEnd());

        const list = new PathList();

        let defines = [];

        for(let line of lines) {

            for(const define of defines) {
                line = line.replaceAll(define.name, define.replace);
            }

            if(line.startsWith('DEFINE ')) {
                const [, name, replace] = line.match(/DEFINE (<.+>) (.+)/);
                defines.push({ name, replace });
            } else if(line.startsWith('INCLUDE ')) {
                const path = PATH.normalize(line.slice('INCLUDE '.length));
                list.include.push(path);
            } else if(line.startsWith('EXCLUDE ')) {
                const path = PATH.normalize(line.slice('EXCLUDE '.length));
                list.exclude.push(path);
            }
        }

        return list;

    }

}



/**
 * Yoink:
 * https://stackoverflow.com/questions/10420352/converting-file-size-in-bytes-to-human-readable-string#answer-20732091
 * @param {number} size  
 * @returns {string} 
 */
function fileSizeString(size) {
    var i = size == 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
    return (size / Math.pow(1024, i)).toFixed(2) * 1 + ' ' + ['B', 'kB', 'MB', 'GB', 'TB'][i];
}



(async function() {

    console.log('Loading pathlist');
    const pathlist = PathList.loadFile('./PATHLIST');

    console.log('Finding files. (May take a minute.)');
    const list = pathlist.getList();



    if(settings.backupped_files != undefined) {
        fs.writeFileSync(
            settings.backupped_files,
            JSON.stringify(
                { ...pathlist, ...list },
                undefined,
                4
            )
        );
    }



    if(list.totalSize >= settings.warning_size) {
        console.log(`Total size is ${fileSizeString(list.totalSize)}`);
        if(!await new Promise(resolve => {
            readline.question('Are you sure you want to continue? Y N: ', answer => {
                return resolve(['y', 'yes'].includes(answer.toLowerCase()));
            });
        })) {
            console.log('Cancelling backup.');
            readline.close();
            return;
        }
    }



    // TODO: Find way to check disk space remaining.



    console.log('Creating backup directory.');
    const date = new Date();
    const backupDirPath = PATH.normalize(`${settings.backups_dir}/${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`);
    if(fs.existsSync(backupDirPath)) {
        console.log(`Already created backup "${backupDirPath}"`);
        readline.close();
        return;
    }
    const backupDir = fs.mkdirSync(backupDirPath, { recursive: true });



    console.log('Backupping files. (May take a while.)');
    console.time('Done!');
    for(const path of list.files) {
        const backupPath = `${backupDir}\\${path.replace(':', '')}`;
        console.log(`"${path}" -> "${backupPath}"`);

        const backupFolder = PATH.dirname(backupPath);
        if(!fs.existsSync(backupFolder)) {
            fs.mkdirSync(backupFolder, { recursive: true });
        }

        fs.copyFileSync(path, backupPath);
    }
    console.timeEnd('Done!');

    console.log(`Backupped to "${backupDir}"`);

    readline.close();

})();


