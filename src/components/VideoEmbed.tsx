import { createElement, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { WebView } from 'react-native-webview';

type Props = {
  youtubeId?: string | null;
  videoUrl: string;
};

export function VideoEmbed({ youtubeId, videoUrl }: Props) {
  if (youtubeId) {
    const src = `https://www.youtube.com/embed/${youtubeId}?rel=0&modestbranding=1`;
    if (Platform.OS === 'web') {
      return (
        <View style={styles.frame}>
          {createElement('iframe', {
            src,
            width: '100%',
            height: '100%',
            style: { border: 0 },
            allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
            allowFullScreen: true,
          })}
        </View>
      );
    }
    return (
      <View style={styles.frame}>
        <WebView
          source={{ uri: src }}
          style={styles.fill}
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction
        />
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.frame}>
        {createElement('video', {
          src: videoUrl,
          controls: true,
          style: { width: '100%', height: '100%' },
        })}
      </View>
    );
  }

  return <NativeFilePlayer uri={videoUrl} />;
}

function NativeFilePlayer({ uri }: { uri: string }) {
  const ref = useRef<Video>(null);
  return (
    <Video
      ref={ref}
      source={{ uri }}
      style={styles.frame}
      resizeMode={ResizeMode.CONTAIN}
      useNativeControls
    />
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', height: 220, backgroundColor: '#000', overflow: 'hidden', borderRadius: 8 },
  fill: { flex: 1, backgroundColor: 'transparent' },
});
