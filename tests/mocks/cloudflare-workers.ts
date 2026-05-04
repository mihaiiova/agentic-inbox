// Minimal mock of cloudflare:workers for Node.js testing

export class DurableObject<Env = unknown> {
	protected ctx: any;
	protected env: Env;
	constructor(state: any, env: Env) {
		this.ctx = state;
		this.env = env;
	}
}

export class DurableObjectState {
	storage: any;
	constructor(storage: any) {
		this.storage = storage;
	}
}
