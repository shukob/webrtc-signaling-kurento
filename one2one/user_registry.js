/*jshint esversion: 6 */
"use strict";
export default class UserRegistry {
    constructor() {
        this.usersById = {};
        this.usersByName = {};
    }

    register(user) {
        this.usersById[user.id] = user;
        this.usersByName[user.name] = user;
    }

    unregister(id) {
        let user = this.getById(id);
        if (user) delete this.usersById[id];
        if (user && this.getByName(user.name)) delete this.usersByName[user.name];
    }

    getById(id) {
        return this.usersById[id];
    }

    getByName(name) {
        return this.usersByName[name];
    }

    removeById(id) {
        let user = this.usersById[id];
        if (!user)return;
        delete this.usersById[id];
        delete this.usersByName[user.name];
    }
}
