var Game = function() {
  var self = this;
  self.avatars = {}; 
  self.bullets = []; 
  self.platforms = [];
  self.player_id = 0; //better if this is not undefined

  self.on_player_entry = function(ev) {
    ev.player.avatar.game = self;
    self.player = ev.player;
    self.avatars[ev.player.name] = ev.player.avatar;
  };

  $('body').bind('player.entry', self.on_player_entry );

  self.on_server_message = function(e,msg){
    var message = JSON.parse(msg);

    if(message.event == 'player_connect'){
      self.player_id = message.id;
      self.level_id = message.level_id;
      console.log(message);
      Level(message.level);

    } else if(message.event=='bullet'){
      self.create_bullet({position:message.bullet.position,owner_id: message.id, direction: message.bullet.direction});    

    } else if(message.event == 'die') {
      delete self.avatars[message.id];

    } else {
      message.game = self;
      if(self.avatars[message.id]) {
        self.avatars[message.id].position = message.position;
        self.avatars[message.id].direction = message.direction;
        self.avatars[message.id].life = message.life;
      } else {
        self.avatars[message.id] = new Avatar(message);

      }
    }
  };

  $('body').bind('ws_message',self.on_server_message);

  self.socket = create_websocket('ws://'+window.location.hostname+':8001');

  self.on_player_shoot = function(ev){
    var position = {x: ev.player.avatar.position.x+AVATAR_WIDTH/2, y: ev.player.avatar.position.y+AVATAR_HEIGHT/3};

    var bullet = self.create_bullet({position:position, owner_id: self.player_id, direction:ev.player.avatar.direction});

    self.socket.send(JSON.stringify({event:'bullet', id:self.player_id, level_id:self.level_id, bullet: bullet}));
  };

  $('body').bind('player.shoot', self.on_player_shoot)

  self.bullet_destructors = [];
  self.create_bullet = function(options){
    var bullet = new Bullet(options);
    self.bullets.push(bullet);
    bullet.destroy = function() {
      self.bullets.splice(self.bullets.indexOf(bullet), 1);
      delete bullet;
    };
    setTimeout( bullet.destroy, BULLET_TIMEOUT );
    return bullet;
  };
  
  self.on_level_loaded = function(ev){
    console.log('level is loading', ev.level);
    self.current_level = ev.level;
    self.build_display();
    $('body').trigger(jQuery.Event('ready_to_start'));
  };
  $('body').bind('level.loaded', self.on_level_loaded);

  self.on_bullet_collision = function(ev) {
    ev.bullet.destroy();
    --self.player.life;
    self.socket.send(JSON.stringify({event: 'collision', id: self.player_id, owner_id: ev.bullet.owner_id}));
    if(self.player.life <= 0){
      self.kill_player(ev.bullet.owner_id);
    };
    ++self.player.hits;
    self.socket.send(JSON.stringify({event: 'collision', id: self.player_id, level_id:self.level_id, owner_id: ev.bullet.owner_id}));
  };
   
  $('body').bind('bullet.collision', self.on_bullet_collision);

  self.build_display = function(){
    $('#level-container').html(self.current_level.html);
  };
  self.kill_player = function(owner_id){
    self.socket.send( JSON.stringify({
      event: 'die',
      id: this.player_id,
      owner_id: owner_id
      }));
    $('#death-page').css('display', 'block');
    self.socket.disconnect();
  }
  self.next_tick = function(){
    self.update_sprites();
    self.detect_collisions();
    self.refresh_display();
    self.scroll_to_avatar();
    self.update_server();
  };

  // game loop functions
  self.start = function(){
    self.loop_timer = setInterval(function() { self.next_tick(); }, ONE_GAME_TICK);
  };
  self.pause = function() {
    clearInterval(self.loop_timer);
  };
  return self;
}

Game.prototype = {
  update_server: function(){
    this.socket.send( JSON.stringify({
      id:this.player_id,
      name:this.player.name,
      position:this.player.avatar.position, 
      direction: this.player.avatar.direction,
      life: this.player.life 
      }));
  },
  update_sprites: function(){
    $.each(this.avatars,function( i, avatar){
      avatar.update_animation();
    });

    this.player.avatar.update_position();

    $.each(this.bullets,function( i, bullet){
      bullet.update_position();
    });
  },
  refresh_display: function() {
    var sprites_html = [];
    $.each(this.avatars,function( i, avatar){
      sprites_html.push(avatar.html);
    });
    $.each(this.bullets,function( i, bullet){
      sprites_html.push(bullet.html);
    });
    
    $('#sprite-container').empty();
    $('#sprite-container').html(sprites_html.join(''));
  },
  scroll_to_avatar: function() {
    var avatar = this.player.avatar;
    window.scrollTo(avatar.position.x-($(window).width()/2), avatar.position.y-($(window).height()/2));
  },              
  add_platform: function(platform) {
    this.current_level.platforms.push(platform);
  },

  detect_collisions: function() {
    var avatar =  { 
      x: this.player.avatar.position.x,
      y: this.player.avatar.position.y,
      x_end: this.player.avatar.position.x + AVATAR_WIDTH,
      y_end: this.player.avatar.position.y + AVATAR_HEIGHT
    };

    var game = this;
    $.each(this.bullets, function(i, bullet){
      if(!bullet) return; 
      if(bullet.owner_id.toString() == game.player_id.toString()) {
        return;
      }

      var bpos =  {
        x: bullet.position.x,
        y: bullet.position.y,
        x_end: bullet.position.x + BULLET_WIDTH,
        y_end: bullet.position.y + BULLET_HEIGHT
      };
      var x_overlap = ( 
        bpos.x > avatar.x && bpos.x < avatar.x_end
        || bpos.x_end > avatar.x && bpos.x_end < avatar.x_end
      );
      var y_overlap = ( 
        bpos.y > avatar.y && bpos.y < avatar.y_end
        || bpos.y_end > avatar.y && bpos.y_end < avatar.y_end
      );
      if(x_overlap && y_overlap) {
        var collision = jQuery.Event('bullet.collision');
        collision.bullet = bullet;
        $('body').trigger(collision);
      } 
    });   
  },

  get sprites() {
    return this.bullets + this.avatars;
  },
  get current_avatar() {
    return this.avatars[0];
  }
};
