import { ILlmServer } from "./index_settings";
import { util } from "./util";


export class AILinkage {
    private _server: ILlmServer;
    public constructor(server: ILlmServer) {
        this._server = server;
    }
    public async TestConnection(): Promise<[boolean, string]> {
        let baseUrl = this._server.url;
        if(!baseUrl) return [false, 'URL is required'];
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