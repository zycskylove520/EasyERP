/**
 * 领域错误：携带 HTTP 状态码，供全局异常过滤器转成响应。
 * 区分「未找到(404)」「参数冲突(409)」「校验失败(400)」。
 */
export class DomainError extends Error {
  constructor(
    message: string,
    /** HTTP 状态码 */
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

/** 资源不存在。 */
export class NotFoundError extends DomainError {
  constructor(resource: string, id: number | string) {
    super(`${resource} ${id} 不存在`, 404);
    this.name = 'NotFoundError';
  }
}

/** 唯一约束冲突。 */
export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

/** 参数校验失败。 */
export class BadRequestError extends DomainError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'BadRequestError';
  }
}
