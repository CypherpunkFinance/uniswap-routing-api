import bunyan from 'bunyan'

export type BaseRInj = {
  log: bunyan
  id: string
}

export abstract class Injector<CInj, RInj extends BaseRInj, ReqBody, ReqQueryParams> {
  private containerInjected: CInj
  public constructor(protected injectorName: string) {}

  public async build() {
    this.containerInjected = await this.buildContainerInjected()
    return this
  }

  public abstract getRequestInjected(
    containerInjected: CInj,
    requestBody: ReqBody,
    requestQueryParams: ReqQueryParams,
    event: any,
    context: any,
    log: bunyan,
    metrics: any
  ): Promise<RInj>

  public abstract buildContainerInjected(): Promise<CInj>

  public async getContainerInjected(): Promise<CInj> {
    if (this.containerInjected === undefined) {
      throw new Error('Container injected undefined. Must call build() before using.')
    }
    return this.containerInjected
  }
} 