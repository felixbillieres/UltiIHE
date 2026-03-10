/**
 * Caido GraphQL client — server-side proxy to Caido's API.
 * Centralizes auth and avoids CORS issues from the browser.
 */

export interface CaidoRequestSummary {
  id: string
  method: string
  host: string
  port: number
  path: string
  query: string
  scheme: string
  length: number
  statusCode?: number
  responseLength?: number
  roundtripTime?: number
  createdAt: string
}

export interface CaidoRequestDetail extends CaidoRequestSummary {
  rawRequest: string
  rawResponse: string
}

export interface CaidoScope {
  id: string
  name: string
  allowList: string[]
  denyList: string[]
}

interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

export interface CaidoRequestPage {
  requests: CaidoRequestSummary[]
  pageInfo: PageInfo
  totalCount: number
}

export class CaidoClient {
  constructor(
    private url: string,
    private token: string,
  ) {}

  private async query<T>(graphql: string, variables?: Record<string, unknown>): Promise<T> {
    const endpoint = `${this.url.replace(/\/$/, "")}/graphql`
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ query: graphql, variables }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`Caido API error ${res.status}: ${text.slice(0, 200)}`)
    }

    const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
    if (json.errors?.length) {
      throw new Error(`Caido GraphQL: ${json.errors.map((e) => e.message).join(", ")}`)
    }
    if (!json.data) {
      throw new Error("Caido GraphQL: empty response")
    }
    return json.data
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.query<unknown>(`{ __typename }`)
      return true
    } catch {
      return false
    }
  }

  async getRequests(opts: {
    first?: number
    after?: string
    filter?: string
  } = {}): Promise<CaidoRequestPage> {
    const { first = 50, after, filter } = opts

    const data = await this.query<{
      requests: {
        edges: { node: any; cursor: string }[]
        pageInfo: PageInfo
        count: { value: number }
      }
    }>(
      `query GetRequests($first: Int!, $after: String, $filter: HTTPQL) {
        requests(first: $first, after: $after, filter: $filter, order: DESC) {
          edges {
            node {
              ...RequestFields
            }
            cursor
          }
          pageInfo { hasNextPage endCursor }
          count { value }
        }
      }

      fragment RequestFields on Request {
        id
        method
        host
        port
        path
        query
        isTls
        length
        createdAt
        response {
          statusCode
          length
          roundtripTime
        }
      }`,
      { first, after: after || null, filter: filter || null },
    )

    return {
      requests: data.requests.edges.map((e) => mapRequest(e.node)),
      pageInfo: data.requests.pageInfo,
      totalCount: data.requests.count?.value ?? 0,
    }
  }

  async getRequestById(id: string): Promise<CaidoRequestDetail> {
    const data = await this.query<{ request: any }>(
      `query GetRequest($id: ID!) {
        request(id: $id) {
          id
          method
          host
          port
          path
          query
          isTls
          length
          createdAt
          raw
          response {
            statusCode
            length
            roundtripTime
            raw
          }
        }
      }`,
      { id },
    )

    const r = data.request
    return {
      ...mapRequest(r),
      rawRequest: r.raw || "",
      rawResponse: r.response?.raw || "",
    }
  }

  async getScopes(): Promise<CaidoScope[]> {
    const data = await this.query<{ scopes: any[] }>(
      `{ scopes { id name allowList denyList } }`,
    )
    return data.scopes
  }

  async getSitemap(parentId?: string): Promise<any[]> {
    const data = await this.query<{ sitemap: any[] }>(
      `query GetSitemap($parentId: ID) {
        sitemap(parentId: $parentId) {
          id
          label
          kind
          hasChildren
        }
      }`,
      { parentId: parentId || null },
    )
    return data.sitemap
  }
}

function mapRequest(node: any): CaidoRequestSummary {
  return {
    id: node.id,
    method: node.method || "GET",
    host: node.host || "",
    port: node.port || 0,
    path: node.path || "/",
    query: node.query || "",
    scheme: node.isTls ? "https" : "http",
    length: node.length || 0,
    statusCode: node.response?.statusCode,
    responseLength: node.response?.length,
    roundtripTime: node.response?.roundtripTime,
    createdAt: node.createdAt || "",
  }
}

// ── Singleton ────────────────────────────────────────────────

let _client: CaidoClient | null = null

export function getCaidoClient(): CaidoClient | null {
  return _client
}

export function setCaidoClient(url: string, token: string): CaidoClient {
  _client = new CaidoClient(url, token)
  return _client
}

export function clearCaidoClient(): void {
  _client = null
}
