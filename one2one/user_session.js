/*jshint esversion: 6*/
"use strict";
export default class UserSession {
    constructor(id, name, ws) {
        this.id = id;
        this.name = name;
        this.ws= ws;
        this.peer = null;
        this.sdpOffer = null;
    }

    sendMessage(message) {
        this.ws.emit(JSON.stringify(message));
    }
}
