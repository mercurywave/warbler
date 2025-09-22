import { Nil, util, Rest } from "@shared/util";

export class AIServer {
    public type: string;
    public url: string;
    public constructor(type: string, url: string) {
        type = type.toUpperCase();
        if (['OLLAMA'].includes(type)) {
            this.type = type;
            this.url = url;
        } else {
            this.type = '';
            this.url = '';
        }
    }

    public get isEnabled(): boolean { return !!this.type && !!this.url; }

    public get summaryModel(): string | Nil { return process.env.SUMMARY_MODEL; }

    public async TestConnection(): Promise<[boolean, string]> {
        let baseUrl = this.url;
        if (!baseUrl) return [false, 'URL is required'];
        let url = util.appendPathToUrl(baseUrl, 'api/tags');
        try {
            const response = await fetch(url, {
                method: 'GET',
            });

            if (response.ok) {
                const result = await response.json();
                console.log('Response from backend:', result);
                return [true, "👍"];
            } else {
                console.error('Failed:', response.status, response.statusText);
                return [false, `Error: ${response.status} ${response.statusText}`];
            }
        } catch (error) {
            console.error('Error:', error);
            return [false, `Error: ${error}`];
        }
    }
}

export let AI = new AIServer(process.env.LLM_TYPE ?? '', process.env.LLM_URL ?? '');