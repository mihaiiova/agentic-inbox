// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface Env extends Cloudflare.Env {
	POLICY_AUD: string;
	TEAM_DOMAIN: string;
	PUSHOVER_APP_TOKEN: string;
	AI_GATEWAY_ID?: string;
	AI_GATEWAY_TOKEN?: string;
	AI_GATEWAY_ENDPOINT?: string;
	APP_BASE_URL?: string;
	DOMAINS?: string;
	EMAIL_ADDRESSES?: string[];
}
