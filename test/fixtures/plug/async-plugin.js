'use strict';

module.exports = function (app, done) {
    setTimeout(function () {
        app.async = 42;
        done();
    }, 42);
};
