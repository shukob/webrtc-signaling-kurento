// Represents a B2B active call

import UserRegistry from "./user_registry";
/*
 * Server startup
 */

export default class Server {
    constructor() {
        this.userRegistry = new UserRegistry();
    }

    boot(server, path) {
        var self = this;
        var wss = new ws.Server({
            server: server,
            path: '/one2one'
        });

        wss.on('connection', function (ws) {
            var sessionId = nextUniqueId();
            console.log('Connection received with sessionId ' + sessionId);

            ws.on('error', function (error) {
                console.log('Connection ' + sessionId + ' error');
                self.stop(sessionId);
            });

            ws.on('close', function () {
                console.log('Connection ' + sessionId + ' closed');
                self.stop(sessionId);
                self.userRegistry.unregister(sessionId);
            });

            // TODO emit turn/stun
            ws.on('message', function (_message) {
                var message = JSON.parse(_message);
                console.log('Connection ' + sessionId + ' received message ', message);

                switch (message.id) {
                    case 'register':
                        self.register(sessionId, message.name, ws);
                        break;

                    case 'call':
                        self.call(sessionId, message.to, message.from, message.sdpOffer);
                        break;

                    case 'incomingCallResponse':
                        self.incomingCallResponse(sessionId, message.from, message.callResponse, message.sdpOffer, ws);
                        break;

                    case 'stop':
                        self.stop(sessionId);
                        break;

                    case 'onIceCandidate':
                        self.onIceCandidate(sessionId, message.candidate);
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


    stop(sessionId) {
        var stopperUser = this.userRegistry.getById(sessionId);
        var stoppedUser = this.userRegistry.getByName(stopperUser.peer);
        stopperUser.peer = null;

        if (stoppedUser) {
            stoppedUser.peer = null;
            var message = {
                id: 'stopCommunication',
                message: 'remote user hanged out'
            }
            stoppedUser.sendMessage(message)
        }

        this.clearCandidatesQueue(sessionId);
    }

    incomingCallResponse(calleeId, from, callResponse, calleeSdp, ws) {

        var self = this;
        this.clearCandidatesQueue(calleeId);

        function onError(callerReason, calleeReason) {
            if (caller) {
                var callerMessage = {
                    id: 'callResponse',
                    response: 'rejected'
                }
                if (callerReason) callerMessage.message = callerReason;
                caller.sendMessage(callerMessage);
            }

            var calleeMessage = {
                id: 'stopCommunication'
            };
            if (calleeReason) calleeMessage.message = calleeReason;
            callee.sendMessage(calleeMessage);
        }

        var callee = self.userRegistry.getById(calleeId);
        if (!from || !self.userRegistry.getByName(from)) {
            return onError(null, 'unknown from = ' + from);
        }
        var caller = self.userRegistry.getByName(from);

        if (callResponse === 'accept') {

            var message = {
                id: 'startCommunication',
            };
            callee.sendMessage(message);

            message = {
                id: 'callResponse',
                response: 'accepted'
            };
            caller.sendMessage(message);

        } else {
            var decline = {
                id: 'callResponse',
                response: 'rejected',
                message: 'user declined'
            };
            caller.sendMessage(decline);
        }
    }

    call(callerId, to, from, sdpOffer) {
        var self = this;
        var caller = self.userRegistry.getById(callerId);
        var rejectCause = 'User ' + to + ' is not registered';
        if (self.userRegistry.getByName(to)) {
            var callee = self.userRegistry.getByName(to);
            caller.sdpOffer = sdpOffer
            callee.peer = from;
            caller.peer = to;
            var message = {
                id: 'incomingCall',
                from: from
            };
            try {
                return callee.sendMessage(message);
            } catch (exception) {
                rejectCause = "Error " + exception;
            }
        }
        var message = {
            id: 'callResponse',
            response: 'rejected: ',
            message: rejectCause
        };
        caller.sendMessage(message);
    }

    register(id, name, ws, callback) {
        var self = this;

        function onError(error) {
            ws.send(JSON.stringify({id: 'registerResponse', response: 'rejected ', message: error}));
        }

        if (!name) {
            return onError("empty user name");
        }

        if (self.userRegistry.getByName(name)) {
            return onError("User " + name + " is already registered");
        }

        self.userRegistry.register(new UserSession(id, name, ws));
        try {
            ws.send(JSON.stringify({id: 'registerResponse', response: 'accepted'}));
        } catch (exception) {
            onError(exception);
        }
    }

}


app.use(express.static(path.join(__dirname, 'static')));