/**
 * Created by numminorihsf on 17.02.16.
 */
function MessageTuner(options){

  this.exchanges = options.exchanges || {};
  this.exchanges.rpc = options.exchanges.rpc || 'rpc.bus';
  this.exchanges.rpcRes = options.exchanges.rpcRes || 'rpc.res.bus';
  this.exchanges.event = options.exchanges.event || 'event.bus';



}

