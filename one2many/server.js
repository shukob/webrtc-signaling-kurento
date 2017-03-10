/*
 * (C) Copyright 2014-2015 Kurento (http://kurento.org/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import KurentoHelper from "../kurento/kurento_helper";
import uuid from 'node-uuid'
import ws from "ws";
/*
 * Definition of functions
 */

export default class Server {

    boot(server, path) {
        var self = this;
        var wss = new ws.Server({
            server: server,
            path: path
        });

        console.log('Serving one2many broadcast signaling on ' + path + '...');
        /*
         * Management of WebSocket messages
         */
        wss.on('connection', function (ws) {

            var sessionId = Server.nextUniqueId();
            console.log('Connection received with sessionId ' + sessionId);

            ws.on('error', function (error) {
                console.log('Connection ' + sessionId + ' error');
                for (let room in self.viewerLists) {
                    for (let i in self.viewerLists[room]) {
                        if (i === sessionId) {
                            self.stop(room, sessionId);
                        }
                    }
                }
            });

            ws.on('close', function () {
                console.log('Connection ' + sessionId + ' closed');
                for (let room in self.viewerLists) {
                    for (let i in self.viewerLists[room]) {
                        if (i === sessionId) {
                            self.stop(room, sessionId);
                        }
                    }
                }
            });

            ws.on('message', function (_message) {
                var message = JSON.parse(_message);
                console.log('Connection ' + sessionId + ' received message ', message);

                switch (message.id) {
                    case 'presenter':
                        self.startPresenter(message.room, sessionId, ws, message.sdpOffer, (error, sdpAnswer) => {
                            if (error) {
                                return ws.send(JSON.stringify({
                                    id: 'presenterResponse',
                                    response: 'rejected',
                                    message: error
                                }));
                            }
                            ws.send(JSON.stringify({
                                id: 'presenterResponse',
                                response: 'accepted',
                                sdpAnswer: sdpAnswer
                            }));
                        });
                        break;

                    case 'viewer':
                        self.startViewer(message.room, sessionId, ws, message.sdpOffer, (error, sdpAnswer) => {
                            if (error) {
                                return ws.send(JSON.stringify({
                                    id: 'viewerResponse',
                                    response: 'rejected',
                                    message: error
                                }));
                            }

                            ws.send(JSON.stringify({
                                id: 'viewerResponse',
                                response: 'accepted',
                                sdpAnswer: sdpAnswer
                            }));
                        });
                        break;

                    case 'stop':
                        self.stop(message.room, sessionId);
                        break;

                    case 'onIceCandidate':
                        self.onIceCandidate(message.room, sessionId, message.candidate);
                        break;

                    default:
                        ws.send(JSON.stringify({
                            id: 'error',
                            message: 'Invalid message ' + message
                        }));
                        break;
                }
            });
        });

    }

    static nextUniqueId() {
        var res = uuid.v4();
        return res;
    }

    static noPresenterMessage = 'No active presenter. Try again later...';

    constructor(kurento_ws_uri) {
        this.kurentoHelper = new KurentoHelper(kurento_ws_uri);
        this.candidatesQueue = {};
        this.presenters = {};
        this.viewerLists = {};
    }


    startPresenter(room, sessionId, ws, sdpOffer, callback) {
        var self = this;
        self.clearCandidatesQueue(sessionId);

        if (self.presenters[room] !== null) {
            self.stop(room, sessionId);
            return callback("Another user is currently acting as presenter. Try again later ...");
        }

        var presenter = {
            id: sessionId,
            pipeline: null,
            webRtcEndpoint: null
        };
        self.presenters[room] = presenter;

        self.kurentoHelper.getKurentoClient((error, kurentoClient) => {
            if (error) {
                self.stop(room, sessionId);
                return callback(error);
            }
            self.kurentoClient = kurentoClient;

            if (self.presenters[room] === null) {
                self.stop(room, sessionId);
                return callback(Server.noPresenterMessage);
            }

            kurentoClient.create('MediaPipeline', (error, pipeline) => {
                if (error) {
                    self.stop(room, sessionId);
                    return callback(error);
                }

                if (self.presenters[room] === null) {
                    self.stop(room, sessionId);
                    return callback(Server.noPresenterMessage);
                }

                self.presenters[room].pipeline = pipeline;
                pipeline.create('WebRtcEndpoint', (error, webRtcEndpoint) => {
                    if (error) {
                        self.stop(room, sessionId);
                        return callback(error);
                    }

                    if (self.presenters[room] === null) {
                        self.stop(room, sessionId);
                        return callback(Server.noPresenterMessage);
                    }

                    self.presenters[room].webRtcEndpoint = webRtcEndpoint;

                    if (self.candidatesQueue[sessionId]) {
                        while (self.candidatesQueue[sessionId].length) {
                            var candidate = self.candidatesQueue[sessionId].shift();
                            webRtcEndpoint.addIceCandidate(candidate);
                        }
                    }

                    webRtcEndpoint.on('OnIceCandidate', (event) => {
                        var candidate = self.kurentoHelper.getIceCandidates(event.candidate);
                        ws.send(JSON.stringify({
                            id: 'iceCandidate',
                            candidate: candidate
                        }));
                    });

                    webRtcEndpoint.processOffer(sdpOffer, (error, sdpAnswer) => {
                        if (error) {
                            self.stop(room, sessionId);
                            return callback(error);
                        }

                        if (self.presenters[room] === null) {
                            self.stop(room, sessionId);
                            return callback(Server.noPresenterMessage);
                        }

                        callback(null, sdpAnswer);
                    });

                    webRtcEndpoint.gatherCandidates((error) => {
                        if (error) {
                            self.stop(room, sessionId);
                            return callback(error);
                        }
                    });
                });
            });
        });
    }

    startViewer(room, sessionId, ws, sdpOffer, callback) {
        var self = this;
        self.clearCandidatesQueue(sessionId);

        if (self.presenters[room] === null) {
            self.stop(room, sessionId);
            return callback(Server.noPresenterMessage);
        }

        self.presenters[room].pipeline.create('WebRtcEndpoint', (error, webRtcEndpoint) => {
            if (error) {
                self.stop(room, sessionId);
                return callback(error);
            }
            if (!self.viewerLists[room]) {
                self.viewerLists[room] = {};
            }
            self.viewerLists[room][sessionId] = {
                "webRtcEndpoint": webRtcEndpoint,
                "ws": ws
            };

            if (self.presenters[room] === null) {
                self.stop(room, sessionId);
                return callback(Server.noPresenterMessage);
            }

            if (self.candidatesQueue[sessionId]) {
                while (self.candidatesQueue[sessionId].length) {
                    var candidate = self.candidatesQueue[sessionId].shift();
                    webRtcEndpoint.addIceCandidate(candidate);
                }
            }

            webRtcEndpoint.on('OnIceCandidate', (event) => {
                var candidate = self.kurentoHelper.getIceCandidates(event.candidate);
                ws.send(JSON.stringify({
                    id: 'iceCandidate',
                    candidate: candidate
                }));
            });

            webRtcEndpoint.processOffer(sdpOffer, (error, sdpAnswer) => {
                if (error) {
                    self.stop(room, sessionId);
                    return callback(error);
                }
                if (!self.presenters[room]) {
                    self.stop(room, sessionId);
                    return callback(Server.noPresenterMessage);
                }

                self.presenters[room].webRtcEndpoint.connect(webRtcEndpoint, (error) => {
                    if (error) {
                        self.stop(room, sessionId);
                        return callback(error);
                    }
                    if (!self.presenters[room]) {
                        self.stop(room, sessionId);
                        return callback(Server.noPresenterMessage);
                    }

                    callback(null, sdpAnswer);
                    webRtcEndpoint.gatherCandidates(function (error) {
                        if (error) {
                            self.stop(room, sessionId);
                            return callback(error);
                        }
                    });
                });
            });
        });
    }

    clearCandidatesQueue(sessionId) {
        var self = this;
        if (self.candidatesQueue[sessionId]) {
            delete self.candidatesQueue[sessionId];
        }
    }

    stop(room, sessionId) {
        var self = this;
        let presenter = self.presenters[room];
        if (presenter !== null && presenter.id === sessionId) {
            for (var viewer of self.viewerLists[room]) {
                if (viewer.ws) {
                    viewer.ws.send(JSON.stringify({
                        id: 'stopCommunication'
                    }));
                }
            }
            presenter.pipeline.release();
            delete self.presenters[room];
            delete self.viewerLists[room];

        } else if (self.viewerLists[room][sessionId]) {
            self.viewerLists[room][sessionId].webRtcEndpoint.release();
            delete self.viewerLists[room][sessionId];
        }

        self.clearCandidatesQueue(sessionId);

        if (self.viewerLists.length < 1 && !self.presenters.length < 1) {
            console.log('Closing kurento client');
            self.kurentoClient.close();
            self.kurentoClient = null;
        }
    }

    onIceCandidate(room, sessionId, _candidate) {
        var self = this;
        var candidate = self.kurentoHelper.getIceCandidates(_candidate);

        let presenter = self.presenters[room];
        let viewers = self.viewerLists[room];
        if (presenter && presenter.id === sessionId && presenter.webRtcEndpoint) {
            console.info('Sending presenter candidate');
            presenter.webRtcEndpoint.addIceCandidate(candidate);
        }
        else if (viewers[sessionId] && viewers[sessionId].webRtcEndpoint) {
            console.info('Sending viewer candidate');
            viewers[sessionId].webRtcEndpoint.addIceCandidate(candidate);
        }
        else {
            console.info('Queueing candidate');
            if (!self.candidatesQueue[sessionId]) {
                self.candidatesQueue[sessionId] = [];
            }
            self.candidatesQueue[sessionId].push(candidate);
        }
    }
}
