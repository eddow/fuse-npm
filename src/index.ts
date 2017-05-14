import {FuseBox, JSONPlugin, TypeScriptHelpers, UglifyJSPlugin, CSSPlugin, EnvPlugin, VuePlugin, HTMLPlugin} from "fuse-box";
import npm = require('npm')
import extend = require('extend')
import {join} from 'path'
import {mv, mkdir, test} from 'shelljs'
import {readFileSync, writeFileSync} from 'fs'

declare var process: any;
declare function require(fileName: string): any;

export interface NpmClientOptions {
	downloadPath?: string	//temporary download path
	modulesPath?: string
	raw?: any
	rootPath?: string
	devPath?: string
	prodPath?: string
	versionCacheFile?: string
};

export interface ModuleSpec {
	name: string
	version?: string
	entryPoint?: string
};

var defaultConfig : NpmClientOptions = {
	downloadPath: './fuse_modules/temp',
	modulesPath: './fuse_modules/raw',
	devPath: './fuse_modules/dev',
	prodPath: './fuse_modules/prod',
	rootPath: process.cwd(),
	versionCacheFile: './fuse_modules/versionCache.json'
};

function npmResolve<T>(obj, fct, ...args: any[]) {
	return new Promise<T>((resolve, reject)=> {
		obj[fct].apply(obj, [...args, (err, value)=> {
			if(err) reject(err);
			else resolve(value);
		}]);
	});
}

function mSpec(str: string) : ModuleSpec {
	return (split => <ModuleSpec>{name: split[0], version: split[1]})(str.split('@'));
}

class Versions {
	file: string
	constructor(config: NpmClientOptions) {
		this.file = join(config.rootPath, config.versionCacheFile);
	}
	read() {
		return test('-f', this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : {};
	}
	get(semver:string) {
		return this.read()[semver];
	}
	
	set(semver:string, version: string) {
		var cache = this.read();
		cache[semver] = version;
		writeFileSync(this.file, JSON.stringify(cache), 'utf8')
	}
}

export class NpmClient {
	npmPromise: Promise<any>
	config: NpmClientOptions
	versions: Versions
	constructor(config: NpmClientOptions = {}) {
		config = this.config = {raw: {}, ...defaultConfig, ...config};
		this.versions = new Versions(config);
		this.npmPromise = npmResolve(npm, 'load', {
			...config.raw,
			prefix: config.downloadPath
		}).then(npm=> {
			return npm;
		});
	}
	async command<T>(command: string, ...args: any[]) : T {
		var npm = await this.npmPromise;
		return await npmResolve(npm, command, ...args);
	}
	async lastVer(mod:string) {	//use var semver = require('semver')?
		return Object.keys(await this.command('view', mod, 'version')).pop();
	}
	async version(mod: string) {
		var rv = this.versions.get(mod);
		if(rv) return rv;
		return this.lastVer(mod).then(rv=> {
			this.versions.set(mod, rv);
			return rv;
		})
	}
	async install(spec: string|ModuleSpec, entryPoint?: string): Promise<NpmModule> {
		var mod = ('string'=== typeof spec ? mSpec(<string>spec) : <ModuleSpec>spec);
		mod.version = await this.version(mod.name + (mod.version ? '@'+ mod.version : ''));
		var mName = mod.name + '@' + mod.version,
			modulesFolder = join(this.config.rootPath, this.config.modulesPath),
			moduleFolder = join(modulesFolder, mName);	
		if(entryPoint) mod.entryPoint = entryPoint;
		if(!test('-d', moduleFolder)) {
			var packages: string[][] = await this.command<string[][]>('install', mod.name+'@'+mod.version),
				mainPackage = packages.pop(),
				tmpFolder = join(mainPackage[1]);
			console.assert(mainPackage[0] === mName, 'Version found is the same through npm view and npm install')
			mkdir('-p', modulesFolder);
			mv(tmpFolder, moduleFolder);
		}
		return new NpmModule(this, mod);
	}
}

export interface ModuleFuseOptions {
	versionName?: boolean
	globals?: boolean
}

export class NpmModule implements ModuleSpec {
	client: NpmClient
	name: string
	version: string
	entryPoint: string
	production: boolean = true
	constructor(client: NpmClient, spec: ModuleSpec) {
		extend(this, {client, ...spec});
	}
	get fileName() {
		return this.name+'@'+this.version + '.js';
	}
	get path() {
		var {rootPath, modulesPath} = this.client.config;
		return join(rootPath, modulesPath, this.name+'@'+this.version);
	}
	fuse(opts: ModuleFuseOptions): Promise<string> {
		var {rootPath, devPath, prodPath} = this.client.config,
			fusedPath = this.production? prodPath : devPath,
			filePath = join(rootPath, fusedPath, this.fileName);
		return test('-f', filePath) ?
			Promise.resolve(filePath) :
			new Promise((resolve)=> {	//reject on throw
				var {path, production} = this,
					pkg = require(join(path, 'package.json')),
					entryPoint = this.entryPoint || pkg.main,
					packName = this.name + (opts.versionName ? '@' + this.version : ''),
					fuse = FuseBox.init({
						homeDir: path,
						output: join(rootPath, fusedPath, "$name.js"),
						cache: false,
						plugins: [
							TypeScriptHelpers(),
							EnvPlugin({NODE_ENV: production ? "production" : "development"}),
							CSSPlugin(),
							production && UglifyJSPlugin(),
							VuePlugin(),
							HTMLPlugin(),
							JSONPlugin()
						],
						package: packName,
						globals: opts.globals ? {[packName]: '*'} : {}
					});
				if(!entryPoint)
					throw new Error(`No entry point defined for module ${this.name}@${this.version}`);
				
				fuse.bundle(this.fileName)
					.instructions(`> ${entryPoint}`)
					.completed(proc=> {
						console.assert(filePath === proc.filePath, 'filePath consistency');
						resolve(proc.filePath);
					});
					fuse.run();
			});
	}
}

export async function fused(spec: string|ModuleSpec, opts: NpmClientOptions = {}, entryPoint?: string): Promise<string> {
	return (await (new NpmClient(opts)).install(spec, entryPoint)).fuse();
}