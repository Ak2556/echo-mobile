
import React from 'react';
import { View, StyleSheet, Image, Platform } from 'react-native';

const noiseBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAFQElEQVR42tWaWY4cMQxEUXj/m05v0B8T4JcVKVI8mX4h0I2yFEnV4X/+/ft3/j0+Pj7Ox8fH+R6rL3Vdff/X19f3+l//l/h2L9Vv6rfH6/tX/02fS2Tf1/dYfavP63u89/j+/n7Xk8TqI2v/tH6v97n2QfXV62fPZ31fPdvv7+97fcz9/J6v697H8vB8l17X87W+f9dn7Vnq2+I3vff+d/1u86j/n5+f+T8I4J+FvP638+sT07fS5w0Iq953F1r17RNoC6o+v4vL9rC+7+6nC2R9Fqj/1l/728L1hW17zH0sEF042uPuefXF9jGg2y47yOozC/c1sP/Wb/sFuv2b93l7lPrpE1Ff7bJ/1/e/QAD/LL4FsfNqAXaP6/9dbPX59iS6+LZIdP9dZAu1f7ffVp8tjF0k7THdF7rf/e/6WbC2/9V3gVz4r57R52vvtffZftU+2z5Tvx1+2y+63+459e9Z295Pfc561h7pX12Q2kfv133Qnup/v/1hALfwdmHoG+0h+V8gtwL67C74C+3d87tQvH672LwAujC099qjXRhdmLpA/L4+a710H3TBrM+aN9a+7h7oIrtA/B5dXF1gV4C0eP+r/f7t/x3wFvYd2HbYF9ruD3s+W1jae+7fNtjuf/Xb4v2L/rfn8wLxwmiP276r13fRdMF4D2+r4v2rflv0t5AuhK5r75u/C/H2uPvu31kcvn+1TxfLrv1tL/0t+O157Xftv7cweo+uY+0xC6Jtq/vD/m8f0X1kIVifC2aH9vYvY4X0X9u+XfjuD7o93P/dZ/e4/ls/3c/6f/W7+8h7dHHs/rL66X44vMD+o/1eF+C62A8C8IF0/72+0P1nF52FsgO8bW87fPvHDrgLyPtcQLqwvF97n/a5+7/tM3u/O+C2T+yzO+C1z3V/v3/7PwvM/ru9/t2Otvbbfbfna991Eev/6nf3k22rPbd96Pq38N6Dbr13X3jvtR+7X+w+8vvsL6+O2s/Wf9uvtj0F9xX79O8O/N1Ptn26T14dfQ9s52377Vj7Htb67Q5U+7fnt6fW4Tffr2O1sHT/7f7vvrL/1s+17x22bVPts9/f/u8+8gLsflUfXZy6wO0331fX3r3OdtJ+195977V3W6h/N98WkK7/7ifX/27n9H6/e7fX3/e/66Nrn31o/7aLzn11H3f/2r2nf/s++9/tme7/+t9d0K3ntk/tnz0G99E9P/ffC8h9t4vd9rPtt+/vC/DtfF2o2nPbnnbhtG10P7nvtY+2b9rnrs9tj7s+7xPdb/d9179d6N2n3Q99X/32n71H+9z2x3a4rZuu313T7Qe6H+w/vT973bbtbvfu2rff3fdb+K3nbmf02ffx/l5g97hbb73/7jXtd/u2i919Zwv27gG3A2771n66kNz/XX+3t31f2/bUvu9+0+d3cXZBdZ/f7+599tv1s9tt28e2z61nv4/374LzPtx338/uH7u/r210r7O91v67j3R/6P93v98PAd1H+rdt1X32Lz/j0e2Y2xndP+5/2zPdd3aPdP1s37kP7eO7sNzf2tPu97vP9Tns7m/tv/aZ9q3tJ7q4tv90v90B197uX13Q3af7eH/X/u7nd1vpfrP32L3o+rr7u4u//78u8v8B7Y8jJ79n8SgAAAAASUVORK5CYII=";

export function NoiseOverlay({ opacity = 0.05 }: { opacity?: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image 
        source={{ uri: noiseBase64 }} 
        style={{ width: '100%', height: '100%', opacity }} 
        resizeMode="repeat" 
      />
    </View>
  );
}
