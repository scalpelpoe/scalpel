import { Component, type ReactNode } from 'react'

interface Props {
  pluginId: string
  onError?: (id: string, error: Error) => void
  children: ReactNode
}

interface State {
  error: Error | null
}

export class PluginErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error): void {
    this.props.onError?.(this.props.pluginId, error)
  }

  reload = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
          <div className="text-red-400 font-semibold">Plugin crashed</div>
          <div className="text-xs text-zinc-400 max-w-xs">{this.state.error.message}</div>
          <button onClick={this.reload} className="mt-2 px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-xs rounded">
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
