/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2015 (NumminorihSF) Konstantine Petryaev
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

'use strict';

/**
 * RabbitHeraldClient class.
 *      Класс RabbitHeraldClient
 * @class RabbitHeraldClient
 * @extends event.EventEmitter
 */

/**
 * Constructor.
 *      Конструктор.
 * @method constructor
 * @param {Object} [settings] Settings for RabbitHeraldClient.
 *      Настройки для RabbitHeraldClient.
 * @param {Object} [settings.default] Default settings for messaging.
 *      Настройки для сообщений по умолчанию.
 * @param {Boolean} [settings.forceName=false] If `true` - `settings.name` can change name to some value, else use `settings.connect.user`.
 *      Если `true` - `settings.name` может выставить значение name, иначе, используется `settings.connect.user`.
 * @param {String} [settings.name=(settings.forceName?Math.random():settings.connect.user)] Name of application or client.
 *      Название клиента или приложения.
 * @param {String} [settings.uid=this.name+Math.random()] Unique id of application or client.
 *      Уникальный id приложения или клиента.
 * @param {Logger|Object} [settings.logger] Object for log events.
 *      Объект для логгирования событий.
 * @param {Object} [settings.connect='{port:5672, user:'guest', password:'guest'}'] Object of connection properties.
 *      Объект настроек подключения к серверу.
 * @param {CryptMaker|Object} [settings.messageMaker] Object with make and parse logic.
 *      Объект, реализующий логику создания сообщений и их парсинга.
 * @param {String} [needCrypt='no'] If need crypt messages - algorithm for crypt. By default doesn't encrypt.
 *      Если необходимо шифровать сообщения - алогоритм шифрования. По умолчанию не шифрует.
 * @param {String} [key] Encryption key.
 *      Ключ шифрования.
 * @returns {RabbitHeraldClient}
 */
function RabbitHeraldClient(settings, needCrypt, key){
  RabbitHeraldClient.super_.call(this);
  if (typeof settings === 'string'){
    key = needCrypt;
    needCrypt = settings;
    settings = {};
  }
  settings = settings || {};

  this.connectProp = settings.connect || {};
  this.connectProp.host = this.connectProp.host || '127.0.0.1';
  this.connectProp.port = this.connectProp.port || 5672;
  this.connectProp.user = this.connectProp.user || 'guest';
  this.connectProp.password = this.connectProp.password || 'guest';

  this.default = settings.default || RabbitHeraldClient.defaultVars;
  this.logger = settings.logger || require(__dirname+'/logger.js').getLogger('H_Client');
  if (settings.forceName) this.name = String( (settings.name || settings.iAm || Math.floor(Math.random()*1000000)) );
  else this.name = this.connectProp.user;
  this.uid = String( (settings.uid || this.name + '_' + Math.floor(Math.random()*1000000)) );

  /**
   * Connection status. True if connected.
   *      Статус подключения. True если подключен.
   * @type {boolean}
   */
  this.connected = false;


  var self = this;

  this.lastMessageId = 1;
  this.lastActionId = 1;
  this.messageQueue = [];
  this.messageCallback = {};
  this.rpcCallback = {};
  this.isSocketFree = false;

  this.deliveryPublish = !!settings.deliveryPublish;
  this.rpcFunction = [];


  this.should_work = true;
  this.listening = [];


  this.on('connect', function(){
    this.connected = true;
  }.bind(this));

  this.on('close', function(){
    this.connected = false;
    this.isSocketFree = false;
    if (this.should_work) setTimeout(function(){
      this.connect();
    }.bind(this), 1000);
  }.bind(this));

  this.on('drain', function(){
    var mes = self.messageQueue.shift();
    if (mes) {
      var ready = self.$.write(mes.m, 'utf8', mes.c);
      if (ready) process.nextTick(function(){
        self.emit('drain')
      });
    }
    else self.isSocketFree = true;
  });

  if (!settings.logger) this.logger.warn('No logger defined. Use default (it spawns too much messages).');

  return this;
}


/*
 * Get EventEmitter as prototype.
 * Используем EventEmitter в качестве прототипа.
 */
(function(){
  require('util').inherits(RabbitHeraldClient, (require('events')).EventEmitter);
})();

/**
 * Default variables for messaging. Переменные по умолчанию для сообщений.
 * @static
 * @type {{retry: number, timeout: number}}
 */
RabbitHeraldClient.defaultVars = {
  retry: 5,
  timeout: 1000
};


/**
 * Remote procedure calling by name of application.
 *      Удаленный вызов процедуры у одного из приложений с данным именем.
 * @param {string} name Name of application, that you want to rpc.
 *      Имя приложения, в котором нужно вызвать процедуру.
 * @param {Object} action Action object, that you want to call at application.
 *      Объект действия для удаленного выполнения.
 * @param {string} action.name Action name to do
 *      Название действия для удаленного выполнения.
 * @param {string|Object} action.args Arguments for rpc or callback, if no args need to rpc - send `{}`.
 *      Аргументы для удаленой процедуры. Если не нужны - используйте `{}`.
 * @param {Object} [options] Options for rpc.
 *      Опции для rpc.
 * @param {Function} [callback] Callback for rpc. If rpc failed and no callback defined - RabbitHeraldClient will emit error.
 * First argument for callback is Error object or null. Second is result.
 *      Callback для удаленного вызова. Если вызов не удачен и параметр не определен - RabbitHeraldClient примет ошибку.
 *      Первый аргумент для функции - объект ошибки или null. Второй - результат вызова.
 * @returns {Boolean} true can send just now, false if need to send previous messages.
 *      true если отправленно сразу, false, если необходимо подождать отправки других сообщений.
 */
RabbitHeraldClient.prototype.rpc = function(name, action, options, callback){
  if (!callback){
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    else callback = function(err){
      this.emit('error', err);
    }.bind(this);
  }

  if (!name || typeof name !== 'string') return callback(new Error('WRONG_ARGS'));
  if (!action || typeof action !== 'object') return callback(new Error('WRONG_ARGS'));
  if (!action.name || typeof action.name !== 'string') return callback(new Error('WRONG_ARGS'));
  if (!('args' in action)) return callback(new Error('WRONG_ARGS'));


  var header = {
    messageId: this.lastActionId++
  };

  header.replyTo = this.name + '.rpc.res.'+this.uid;

  var body = JSON.stringify({
    params: action.args,
    id: header.messageId,
    method: action.name
  });

  var self = this;

  var opts = {
    messageId: header.messageId,
    replyTo: self.name+'.rpc.res.'+self.uid,
    userId: self.name,
    timestamp: new Date(),
    expiration: String(15000)
  };

  this.$.getChannelOnConnect(function(err, chan, done){
    if (err)  return callback(err);
    chan.basic.publish('rpc.bus', name, body, opts, {}, function(err){
      done(err);
      if (err){
        return callback(err);
      }
      self.rpcCallback[header.messageId] = callback;
      self.rpcCallback[header.messageId] = function(err, data){
        delete self.rpcCallback[header.messageId];
        clearTimeout(timeout);
        return callback(err, data);
      };

      var timeout = setTimeout(function(){
        self.rpcCallback[header.messageId] && self.rpcCallback[header.messageId](new Error('RPC_TIMEOUT'));
      }, Number(opts.expiration));
    })
  })
};

/**
 * Find rpc call and use
 * @param {string} action
 * @param {Object} headerPart
 * @param {Object} body
 * @param {Object} body.params
 * @param {Function} callback
 * @returns {*}
 * @private
 */
RabbitHeraldClient.prototype._doRpc = function(action, headerPart, body, callback){
  if (!body || !body.params) return callback(new Error('WRONG_ARGS'));
  if (!this.rpcFunction[action]) return callback(new Error('WRONG_ACTION'));
  if (this.rpcFunction[action].length === 2) return this.rpcFunction[action](body.params, callback);
  return this.rpcFunction[action](headerPart, body.params, callback);
};


/**
 * Function for remote calling. It is callback for {@link RabbitHeraldClient#addRpcWorker} method.
 * If function has 2 arguments, caller will not send to it.
 *      Функция для удаленного вызова. Передается как callback в метод {@link RabbitHeraldClient#addRpcWorker}.
 *      Если у функции 2 аргумента - caller не будет передан.
 * @method remoteProcedure
 * @member RabbitHeraldClient
 * @param {Object} [caller] UID and name of application that called this.
 *      UID и название приложения, вызвавшего функцию.
 * @param {Object} args Arguments for call. Аргументы для вызова.
 * @param {Function} callback Callback function to return result. First arg is Error object or null. Second response data if is.
 *      Функция для возврата результатов. Первый аргумент - объект ошибки или null. Второй - результат.
 */


/**
 * Add function to work with rpc calls.
 *      Добавляет функцию для удаленного использования.
 * @param {String} actionName Action name. Название действия.
 * @param {Function} callback Function to call. {@link RabbitHeraldClient#remoteProcedure Should be like this}.
 *      Вызываемая функция. {@link RabbitHeraldClient#remoteProcedure Должна соответствовать этому шаблону}.
 * @returns {Boolean} True if added. false if was function with such name.
 * False means, that you should remove old rpc function with such actionName.
 *      True если добавленно. false если есть функция с таким именем.
 *      False означает, что Вам необходимо удалить старую функцию с таким названием действия.
 */
RabbitHeraldClient.prototype.addRpcWorker = function(actionName, callback){
  if (this.rpcFunction[actionName]) return false;
  this.rpcFunction[actionName] = callback;
  return true;
};


/**
 * Remove rpc function. Удаляет функцию из используемых.
 * @param {String} actionName Action name. Название действия.
 * @returns {Boolean} true if was such function. Else returns false.
 *    true если такая функция была. false, если нет.
 */
RabbitHeraldClient.prototype.removeRpcWorker = function(actionName){
  var answer = actionName in this.rpcFunction;
  delete this.rpcFunction[actionName];
  return answer;
};

RabbitHeraldClient.prototype._sendError = function(id, dest, errorMessage){
  var self = this;
  this.$.getChannelOnConnect(function(err, chan, done){
    chan.basic.publish('rpc.res.bus', dest, JSON.stringify({id: id, error: errorMessage && errorMessage.message || typeof errorMessage === 'string' ? errorMessage : 'Some_Error'}), {
      messageId: id,
      userId: self.name
    }, {}, function(err){
      if (err) console.error('error in send error', err);
    });
  });
};

/**
 * Parse encrypted message and think, what should do with it
 * @returns {*}
 * @private
 */
RabbitHeraldClient.prototype._parseRpcMessage = function(chan, message, h, headers, args){
  var self = this;
  args.messageId = args['message-id'];
  args.replyTo = args['reply-to'];
  args.userId = args['user-id'];
  if (!headers || !args.userId){
    chan.basic.nack(headers['delivery-tag'], {}, function(){});
    return this._sendError(args.messageId, args.replyTo, new Error('Need "user-id" header.'));
  }
  var body;
  try{
    body = JSON.parse(message.toString('utf-8'));
  }
  catch(e){
    chan.basic.nack(headers['delivery-tag'], {}, function(){});
    return this._sendError(args.messageId, args.replyTo, new Error('Need valid message body.'));
  }
  if (!body || !body.id){
    chan.basic.nack(headers['delivery-tag'], {}, function(){});
    return;
  }
  if (!body.method){
    chan.basic.nack(headers['delivery-tag'], {}, function(){});
    return this._sendError(args.messageId, args.replyTo, new Error('Need "method" field in body.'));
  }
  if (!this.rpcFunction[body.method]){
    chan.basic.nack(headers['delivery-tag'], {}, function(){});
    return this._sendError(args.messageId, args.replyTo, new Error('Need available "method" field in body.'));
  }

  return this._doRpc(body.method, {name: args.userId}, body.args, function(err, result){
    chan.basic.ack(headers['delivery-tag'], function(){});
    self.$.getChannelOnConnect(function(err, chan, done){
      if (err)  return console.error('Can not send rpc res', err);
      var opts = {
        messageId: args.messageId,
        replyTo: self.name+'.rpc.res.'+self.uid,
        userId: self.name,
        timestamp: new Date(),
        expiration: String(15000)
      };

      chan.basic.publish('rpc.res.bus', args.replyTo, JSON.stringify({
        error: err,
        result: result,
        id: args.messageId
      }), opts, {}, function(err){
        done(err);
        if (err){
          return callback(err);
        }
        self.rpcCallback[args.messageId] = callback;
        self.rpcCallback[args.messageId] = function(err, data){
          delete self.rpcCallback[header.messageId];
          clearTimeout(timeout);
          return callback(err, data);
        };

        var timeout = setTimeout(function(){
          self.rpcCallback[header.messageId] && self.rpcCallback[header.messageId](new Error('RPC_TIMEOUT'));
        }, Number(opts.expiration));
      });
    });
  });
};

/**
 * Parse encrypted message and think, what should do with it
 * @returns {*}
 * @private
 */
RabbitHeraldClient.prototype._parseRpcResMessage = function(chan, message, h, headers, args){
  var self = this;
  console.error(message);
  console.error(message.toString('utf8'));
  console.error(h);
  console.error(headers);
  console.error(args);
  args.messageId = args['message-id'];
  args.replyTo = args['reply-to'];
  args.userId = args['user-id'];
  if (!args || !args.userId){
    console.error('Undefined rpc res');
    return chan.basic.nack(headers['delivery-tag'], {}, function(){});
  }
  var body;
  try{
    body = JSON.parse(message.toString('utf-8'));
  }
  catch(e){
    console.error('Undefined rpc res');
    return chan.basic.nack(headers['delivery-tag'], {}, function(){});
  }
  if (!body || !body.id){
    return chan.basic.nack(headers['delivery-tag'], {}, function(){});
  }
  if (!this.rpcCallback[args.messageId]){
    console.error('Undefined rpc res');
    return chan.basic.nack(headers['delivery-tag'], {}, function(){});
  }

  this.rpcCallback[args.messageId](body.error, body.result);
  return chan.basic.ack(headers['delivery-tag'], function(){});
};

RabbitHeraldClient.prototype.subscribe = function(){
  console.error('.subscribe is not implemented.');
};

/**
 * Publish some event.
 *      Пибликует событие.
 * @param {String} event
 * @param {Object|String} body
 * @param {Function} callback
 */
//RabbitHeraldClient.prototype.publish = function(event, body, callback){
//  var self = this;
//  this.$.getChannelOnConnect(function(err, chan, done){
//    if (err){
//      return callback(err);
//    }
//    var exchange = self._getExchangeName('event');
//    var routingKey = self._getRoutingKey('event', event);
//    chan.basic.publish(
//      exchange,
//      routingKey,
//      JSON.stringify({
//        jsonrpc:'2.0',
//        id: self.lastMessageId,
//        params: {
//          body: body
//        }
//      }),
//      {
//        'delivery_mode':self.deliveryPublish ? 2 : 1,
//        messageId:self.lastMessageId++,
//        timestamp:new Date()
//      },
//      {},
//      function(err){
//        done(err);
//        callback(err);
//      }
//    );
//  });
//};

RabbitHeraldClient.prototype._declareExchange = function(callback){
  this.$.getChannel(function(err, chan, done) {
    if (err) {
      return callback(err);
    }
    chan.exchange.declare('rpc.bus', 'topic', {durable: true}, function (err) {
      if (err) {
        done(err);
        return callback(err);
      }
      chan.exchange.declare('rpc.res.bus', 'topic', {durable: true}, function (err) {
        if (err) {
          done(err);
          return callback(err);
        }
        chan.exchange.declare('event.bus', 'topic', {durable: true}, function (err) {
            done(err);
            return callback(err);
        });
      });
    });
  });
};

RabbitHeraldClient.prototype._declareAppQueue = function(callback){
  var self = this;
  this.$.getChannel(function(err, chan, done) {
    if (err) {
      return callback(err);
    }
    chan.queue.declare(self.name+'.rpc.in', {durable: true}, function (err) {
      if (err) {
        done(err);
        return callback(err);
      }
      chan.queue.declare(self.name+'.rpc.res', {durable: true}, function (err) {
        done(err);
        return callback(err);
      });
    });
  });
};

RabbitHeraldClient.prototype._declareAppUidQueue = function(callback){
  var self = this;
  this.$.getChannel(function(err, chan, done) {
    if (err) {
      return callback(err);
    }
    chan.queue.declare(self.name+'.rpc.in.'+self.uid, {durable: true, exclusive: true}, function (err) {
      if (err) {
        done(err);
        return callback(err);
      }
      chan.queue.declare(self.name+'.rpc.res.'+self.uid, {durable: true, exclusive: true}, function (err) {
        done(err);
        return callback(err);
      });
    });
  });
};

RabbitHeraldClient.prototype._declareAndBindAppUidEventQueue = function(app, event, callback){
  var self = this;
  this.$.getChannel(function(err, chan, done) {
    if (err) {
      return callback(err);
    }
    var name = self.name+'.event.' + self.uid + '.' + app;
    chan.queue.declare(name, {durable: true, exclusive: true}, function (err) {
      if (err) {
        done(err);
        return callback(err);
      }
      chan.queue.bind(name, 'event.bus', app+'.'+event, {}, function (err) {
        done(err);
        return callback(err);
      });
    });
  });
};

RabbitHeraldClient.prototype._declareAndBindAppEventQueue = function(app, event, callback){
  var self = this;
  this.$.getChannel(function(err, chan, done) {
    if (err) {
      return callback(err);
    }
    var name = self.name+'.event.' + app;
    chan.queue.declare(name, {durable: true}, function (err) {
      if (err) {
        done(err);
        return callback(err);
      }
      chan.queue.bind(name, 'event.bus', app+'.'+event, {}, function (err) {
        done(err);
        return callback(err);
      });
    });
  });
};

RabbitHeraldClient.prototype._bindQueueBasic = function(callback){
  var self = this;
  this.$.getChannel(function(err, chan, done) {
    if (err) {
      return callback(err);
    }
    chan.queue.bind(self.name+'.rpc.in', 'rpc.bus', self.name, {}, function(err){
      if (err) {
        done(err);
        return callback(err);
      }
      chan.queue.bind(self.name+'.rpc.in.'+self.uid, 'rpc.bus', self.name+'-all', {}, function(err){
        if (err) {
          done(err);
          return callback(err);
        }
        chan.queue.bind(self.name+'.rpc.in.'+self.uid, 'rpc.bus', self.name+'.'+self.uid, {}, function(err) {
          if (err) {
            done(err);
            return callback(err);
          }
          chan.queue.bind(self.name+'.rpc.res.'+self.uid, 'rpc.res.bus', self.name+'.rpc.res.'+self.uid, {}, function(err) {
            if (err) {
              done(err);
              return callback(err);
            }
            chan.queue.bind(self.name + '.rpc.res', 'rpc.res.bus', self.name + '.rpc.res', {}, function (err) {
              done(err);
              return callback(err);
            });
          });
        });
      });
    });
  });
};

RabbitHeraldClient.prototype._initRoutes = function(callback){
  var self = this;
  console.log(1);
  self._declareExchange(function(err){
    console.log(2);
    self._declareAppQueue(function(err){
      console.log(3);
      self._declareAppUidQueue(function(err){
        console.log(4);
        self._bindQueueBasic(function(err){
          console.log(5);
          setImmediate(function(){self.$.getChannel(function(err, chan, done){
            if (err) throw err;
            chan.basic.qos({prefetchCount: 100}, function () {
              chan.basic.consume(self.name + '.rpc.in', {}, self._parseRpcMessage.bind(self, chan), function (err) {
                if (err) console.error(err);
              });
            });
          });});
          setImmediate(function(){self.$.getChannel(function(err, chan, done){
            if (err) throw err;
            chan.basic.qos({prefetchCount: 100}, function(){
              chan.basic.consume(self.name + '.rpc.in.'+self.uid, {}, self._parseRpcMessage.bind(self, chan), function(err){
                if (err) console.error(err);
              });
            });
          });});
          setImmediate(function(){self.$.getChannel(function(err, chan, done){
            if (err) throw err;
            chan.basic.qos({prefetchCount: 100}, function(){
              chan.basic.consume(self.name + '.rpc.res', {}, self._parseRpcResMessage.bind(self, chan), function(err){
                if (err) console.error(err);
              });
            });
          });});
          setImmediate(function(){self.$.getChannel(function(err, chan, done){
            if (err) throw err;
            chan.basic.qos({prefetchCount: 100}, function(){
              chan.basic.consume(self.name + '.rpc.res.'+self.uid, {}, self._parseRpcResMessage.bind(self, chan), function(err){
                if (err) console.error(err);
              });
            });
          });});
          callback(null);
        });
      });
    });
  });
};

/**
 * Connect to server. Подключает к серверу.
 * @param {Object} [settings] Settings for connect. Default get from RabbitHeraldClient object.
 *      Настройки для подключения. По умолчанию берет растройки из самого объекта.
 */
RabbitHeraldClient.prototype.connect = function(settings){
  settings = settings || {};
  if (this.connected) return;
  if (this.connecting) return;
  this.connecting = true;
  this.should_work = true;
  this.connectProp = settings.connect || this.connectProp || {};
  this.connectProp.host = this.connectProp.host || '127.0.0.1';
  this.connectProp.port = this.connectProp.port || 5672;
  this.connectProp.user = this.connectProp.user || 'guest';
  this.connectProp.password = this.connectProp.password || 'guest';
  this.connectProp.vhost = this.connectProp.vhost || '/';

  if (this.$) this.$.disconnect(function(){});


  var self = this;

  this.$ = new (require('bramqp-wrapper'))(this.connectProp);
  this.$.connect(function(err){
    if (err){
      self.connecting = false;
      return self.emit('error', err);
    }
    self._initRoutes(function(err){
      if (err) self.emit('error', err);
    });
    self.connected = true;
    self.connecting = false;
    self.$.on('error', self.emit.bind(self));
  });
};

/**
 * Close connect. Закрывает подключение.
 * @param {Function} [callback]
 */
RabbitHeraldClient.prototype.close = function(callback){
  this.$.disconnect(callback || function(){});
};

/**
 * Close connect. Закрывает подключение.
 * @param {Function} [callback]
 */
RabbitHeraldClient.prototype.end = function(callback){
  this.$.disconnect(callback || function(){});
};

/**
 * Unref client.
 * @deprecated
 * @returns {*}
 */
RabbitHeraldClient.prototype.unref = require('util').deprecate(function(){});

/**
 * Ref client.
 * @deprecated
 * @returns {*}
 */
RabbitHeraldClient.prototype.ref = require('util').deprecate(function(){});

/**
 * One more constructor.
 *      Еще один конструктор.
 * @param {Object} [settings] Settings for RabbitHeraldClient.
 *      Настройки для RabbitHeraldClient.
 * @param {Object} [settings.default] Default settings for messaging.
 *      Настройки для сообщений по умолчанию.
 * @param {Boolean} [settings.forceName=false] If `true` - `settings.name` can change name to some value, else use `settings.connect.user`.
 *      Если `true` - `settings.name` может выставить значение name, иначе, используется `settings.connect.user`.
 * @param {String} [settings.name=(settings.forceName?Math.random():settings.connect.user)] Name of application or client.
 *      Название клиента или приложения.
 * @param {String} [settings.uid=this.name+Math.random()] Unique id of application or client.
 *      Уникальный id приложения или клиента.
 * @param {Logger|Object} [settings.logger] Object for log events.
 *      Объект для логгирования событий.
 * @param {Object} [settings.connect='{port:5672, user:'guest', password:'guest'}'] Object of connection properties.
 *      Объект настроек подключения к серверу.
 * @param {CryptMaker|Object} [settings.messageMaker] Object with make and parse logic.
 *      Объект, реализующий логику создания сообщений и их парсинга.
 * @param {String} [needCrypt='no'] If need crypt messages - algorithm for crypt. By default doesn't encrypt.
 *      Если необходимо шифровать сообщения - алогоритм шифрования. По умолчанию не шифрует.
 * @param {String} [key] Encryption key.
 *      Ключ шифрования.
 * @returns {RabbitHeraldClient}
 */
RabbitHeraldClient.createClient = function(settings, needCrypt, key){
  var rhc = new RabbitHeraldClient(settings, needCrypt, key);
  rhc.connect();
  return rhc;
};

module.exports = RabbitHeraldClient;
