export namespace main {
	
	export class PortInfo {
	    port: number;
	    pid: number;
	    process: string;
	    command: string;
	
	    static createFrom(source: any = {}) {
	        return new PortInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.port = source["port"];
	        this.pid = source["pid"];
	        this.process = source["process"];
	        this.command = source["command"];
	    }
	}

}

