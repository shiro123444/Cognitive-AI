import type { Context } from '../cordis/context.js';
import type { Disposable } from '../cordis/types.js';

export interface SessionEvent<T = any> {
  id: string;
  sessionId: string;
  type: string;
  payload: T;
  timestamp: number;
}

export interface SessionState {
  sessionId: string;
  presetId: string;
  events: SessionEvent[];
  slots: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export class SessionService {
  private _sessions = new Map<string, SessionState>();

  constructor(private ctx: Context) {}

  create(sessionId: string, presetId = 'student-tutor'): SessionState {
    const session: SessionState = {
      sessionId,
      presetId,
      events: [],
      slots: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this._sessions.set(sessionId, session);
    this.ctx.emit('session/created', session);
    return session;
  }

  get(sessionId: string): SessionState | undefined {
    return this._sessions.get(sessionId);
  }

  list(): SessionState[] {
    return Array.from(this._sessions.values());
  }

  append<T = any>(sessionId: string, type: string, payload: T): SessionEvent<T> {
    let session = this.get(sessionId);
    if (!session) {
      session = this.create(sessionId);
    }

    const event: SessionEvent<T> = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sessionId,
      type,
      payload,
      timestamp: Date.now(),
    };

    session.events.push(event);
    session.updatedAt = Date.now();

    // If it is a slot mount or update, sync session.slots
    if (type === 'slot/mount' || type === 'slot/update') {
      const { slotId, data } = payload as any;
      if (slotId) {
        session.slots[slotId] = data;
      }
    }

    this.ctx.emit('session/event', event);
    this.ctx.emit(type, event);

    return event;
  }

  mountSlot(sessionId: string, slotId: string, kind: string, data: any) {
    return this.append(sessionId, 'slot/mount', { slotId, kind, data });
  }

  updateSlot(sessionId: string, slotId: string, data: any) {
    return this.append(sessionId, 'slot/update', { slotId, data });
  }
}

export function applySessionPlugin(ctx: Context) {
  const sessions = new SessionService(ctx);
  return ctx.provide('sessions', sessions);
}
