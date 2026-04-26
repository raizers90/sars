const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { User, ElderlyProfile, GuardianElderly } = require('../models/index');
const { SOCKET_EVENTS, ROLES, REDIS_KEYS } = require('../utils/constants');
const { redisGet, redisSet } = require('../config/redis');
const { acknowledgeAlert } = require('./alertService');
const logger = require('../utils/logger');

let io = null;

const initSocketIO = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use(authenticateSocket);
  io.on('connection', handleConnection);

  logger.info('Socket.IO server initialized');
  return io;
};

const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) return next(new Error('Authentication token required'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'sars_secret_key_change_in_production');
    const user = await User.findByPk(decoded.id);
    if (!user || !user.is_active) return next(new Error('User not found or inactive'));

    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
};

const handleConnection = async (socket) => {
  const user = socket.user;
  logger.info(`Socket connected: ${user.email} (${user.role}) [${socket.id}]`);

  // Auto-join rooms based on role
  await joinRoleRooms(socket, user);

  // Event listeners
  socket.on(SOCKET_EVENTS.JOIN_ROOM, (data) => handleJoinRoom(socket, user, data));
  socket.on(SOCKET_EVENTS.LEAVE_ROOM, (data) => socket.leave(data.room));
  socket.on(SOCKET_EVENTS.ACKNOWLEDGE_ALERT, (data) => handleAcknowledgeAlert(socket, user, data));
  socket.on('disconnect', () => handleDisconnect(socket, user));

  // Send current user info
  socket.emit('connected', {
    user_id: user.id,
    role: user.role,
    name: user.name,
    rooms: getRoomsForRole(user),
  });
};

const joinRoleRooms = async (socket, user) => {
  switch (user.role) {
    case ROLES.ADMIN:
      socket.join(['monitoring', 'critical_alerts', 'admin']);
      break;

    case ROLES.MANAGEMENT:
      socket.join(['monitoring', 'critical_alerts']);
      break;

    case ROLES.GUARDIAN: {
      socket.join('critical_alerts');
      const assignments = await GuardianElderly.findAll({
        where: { guardian_id: user.id, is_active: true },
      });
      for (const a of assignments) {
        socket.join(`elderly:${a.elderly_id}`);
      }
      break;
    }

    case ROLES.ELDERLY: {
      const profile = await ElderlyProfile.findOne({ where: { user_id: user.id } });
      if (profile) {
        socket.join(`elderly:${profile.id}`);
        socket.join(`device:${profile.device_id}`);
      }
      break;
    }
  }
};

const handleJoinRoom = async (socket, user, data) => {
  const { room, elderly_id } = data;

  // Guard: guardians can only join their wards' rooms
  if (room?.startsWith('elderly:') && elderly_id) {
    if (user.role === ROLES.GUARDIAN) {
      const assignment = await GuardianElderly.findOne({
        where: { guardian_id: user.id, elderly_id, is_active: true },
      });
      if (!assignment) {
        socket.emit('error', { message: 'Access denied to this room' });
        return;
      }
    } else if (![ROLES.ADMIN, ROLES.MANAGEMENT].includes(user.role)) {
      socket.emit('error', { message: 'Unauthorized room join' });
      return;
    }
    socket.join(`elderly:${elderly_id}`);
  }
};

const handleAcknowledgeAlert = async (socket, user, data) => {
  try {
    const { alert_id } = data;
    if (!alert_id) return;
    const alert = await acknowledgeAlert(alert_id, user.id);
    socket.emit('alert:acknowledged', { alert_id, status: alert.status });
  } catch (err) {
    socket.emit('error', { message: err.message });
  }
};

const handleDisconnect = (socket, user) => {
  logger.info(`Socket disconnected: ${user.email} [${socket.id}]`);
};

const getRoomsForRole = (user) => {
  switch (user.role) {
    case ROLES.ADMIN: return ['monitoring', 'critical_alerts', 'admin'];
    case ROLES.MANAGEMENT: return ['monitoring', 'critical_alerts'];
    case ROLES.GUARDIAN: return ['critical_alerts', '+ assigned elderly rooms'];
    case ROLES.ELDERLY: return ['own room'];
    default: return [];
  }
};

const emitHealthUpdate = (elderlyId, data) => {
  if (!io) return;
  io.to(`elderly:${elderlyId}`).emit(SOCKET_EVENTS.HEALTH_UPDATE, data);
  io.to('monitoring').emit(SOCKET_EVENTS.HEALTH_UPDATE, { elderly_id: elderlyId, ...data });
};

const emitDeviceStatus = (elderlyId, deviceId, status) => {
  if (!io) return;
  io.to(`elderly:${elderlyId}`).emit(SOCKET_EVENTS.DEVICE_STATUS, { elderly_id: elderlyId, device_id: deviceId, status });
  io.to('monitoring').emit(SOCKET_EVENTS.DEVICE_STATUS, { elderly_id: elderlyId, device_id: deviceId, status });
};

const getIO = () => io;

module.exports = { initSocketIO, getIO, emitHealthUpdate, emitDeviceStatus };
