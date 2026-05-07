import React from 'react';
import { Text, View } from 'react-native';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State { error: Error | null }

export class NativeModuleGuard extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <View style={{ padding: 16, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#71717A', fontSize: 13, textAlign: 'center' }}>
            {'Feature requires a dev build — run npx expo run:ios'}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}
