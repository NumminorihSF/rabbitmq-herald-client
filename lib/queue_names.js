/**
 * Created by numminorihsf on 12.02.16.
 */
function SelfQueueNames (name, uid){
  this.name = name;
  this.uid = uid;
  return this;
}

SelfQueueNames.prototype.getRpcForApp = function(){
  return this.name + '.rpc.in';
};

SelfQueueNames.prototype.getRpcForOne = function(){
  return this.name + '.rpc.in.'+this.uid;
};

SelfQueueNames.prototype.getRpcResForApp = function(){
  return this.name + '.rpc.res';
};

SelfQueueNames.prototype.getRpcResForOne = function(){
  return this.name + '.rpc.res.' + this.uid;
};

SelfQueueNames.prototype.getEventForApp = function(eventCreator){
  return this.name + '.event.' + eventCreator;
};

SelfQueueNames.prototype.getEventForOne = function(eventCreator){
  return this.name + '.event.' + this.uid + '.' + eventCreator;
};

module.exports = function (name, uid){
  return new SelfQueueNames(name, uid);
};