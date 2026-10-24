import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

export default function Index() {
  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: 'https://pizza-cvwx.onrender.com' }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <ActivityIndicator
            size="large"
            color="#208AEF"
            style={StyleSheet.absoluteFill}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
});