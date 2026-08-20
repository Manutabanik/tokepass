"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"

import { TokepassErrorScreen } from "@/components/errors/tokepass-error-screen"
import { logger } from "@/lib/logger"

type Props = {
  children: ReactNode
  homeHref?: string
  homeLabel?: string
}

type State = {
  error: Error | null
}

export class ClientErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error({
      context: "client-error-boundary",
      message: "client_error_boundary",
      error,
      componentStack: info.componentStack,
    })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <TokepassErrorScreen
        reset={() => this.setState({ error: null })}
        homeHref={this.props.homeHref ?? "/admin"}
        homeLabel={this.props.homeLabel ?? "Ir al inicio"}
      />
    )
  }
}
