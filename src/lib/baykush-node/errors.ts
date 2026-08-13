export type NodeClientErrorCode='NOT_CONFIGURED'|'UNAUTHORIZED'|'INVALID_RESPONSE'|'UNAVAILABLE'|'INVALID_REQUEST'|'NOT_FOUND'|'REMOTE_ERROR';
export class NodeClientError extends Error{constructor(readonly code:NodeClientErrorCode,message:string,readonly status:number|null=null){super(message);this.name='NodeClientError';}}
