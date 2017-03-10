/*jshint esversion:6*/
"use strict";
import kurento from 'kurento-client';

// Recover kurentoClient for the first time.
export default class KurentoHelper {
    constructor(kurento_ws_uri) {
        this.kurent_ws_uri = kurento_ws_uri;
    }

    getKurentoClient(callback) {
        if (this.kurentoClient) {
            callback(null, this.kurentoClient);
        } else {
            const self = this;
            kurento(this.kurent_ws_uri, (error, _kurentoClient) => {
                if (error) {
                    const message = `Coult not find media server at address ${self.kurent_ws_uri}`;
                    return callback(`${message}. Exiting with error ${error}`);
                }

                self.kurentoClient = _kurentoClient;
                callback(null, self.kurentoClient);
            });
        }
    }

    static getIceCandidates(callback) {
        kurento.getComplexType('IceCandidate')(callback);
    }
}
