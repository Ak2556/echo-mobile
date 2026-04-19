import React, { useState } from 'react';
import { View, Text, Pressable, Alert, TextInput as RNTextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, AlertTriangle } from 'lucide-react-native';

const REASONS = [
  'Spam or misleading',
  'Harassment or bullying',
  'Hate speech',
  'Violence or threats',
  'Inappropriate content',
  'Impersonation',
  'Other',
];

export default function ReportScreen() {
  const router = useRouter();
  const { targetType, targetId, targetName } = useLocalSearchParams<{
    targetType: string; targetId: string; targetName: string;
  }>();
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');

  const handleSubmit = () => {
    if (!selectedReason) {
      Alert.alert('Select a reason', 'Please select a reason for your report.');
      return;
    }
    Alert.alert(
      'Report Submitted',
      'Thank you for helping keep Echo safe. We\'ll review this report shortly.',
      [{ text: 'OK', onPress: () => router.back() }]
    );
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-black">
      <View className="flex-row items-center px-4 py-3 border-b border-zinc-900">
        <Pressable onPress={() => router.back()} className="p-1 mr-3">
          <ArrowLeft color="#fff" size={24} />
        </Pressable>
        <Text className="text-white font-bold text-lg">Report</Text>
      </View>

      <View className="px-4 pt-6">
        <View className="flex-row items-center mb-2">
          <AlertTriangle color="#F59E0B" size={20} />
          <Text className="text-white text-lg font-bold ml-2">
            Report {targetType === 'user' ? `@${targetName}` : 'this content'}
          </Text>
        </View>
        <Text className="text-zinc-400 text-sm mb-6">
          Select the reason that best describes the issue. Your report is confidential.
        </Text>

        {REASONS.map(reason => (
          <Pressable
            key={reason}
            onPress={() => setSelectedReason(reason)}
            className={`flex-row items-center py-3.5 px-4 rounded-xl mb-2 border ${
              selectedReason === reason ? 'bg-blue-600/10 border-blue-600' : 'bg-zinc-900 border-zinc-800'
            }`}
          >
            <View className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${
              selectedReason === reason ? 'border-blue-500' : 'border-zinc-600'
            }`}>
              {selectedReason === reason && <View className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
            </View>
            <Text className="text-white text-base">{reason}</Text>
          </Pressable>
        ))}

        {selectedReason === 'Other' && (
          <View className="mt-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
            <RNTextInput
              className="text-white text-base"
              placeholder="Describe the issue..."
              placeholderTextColor="#71717A"
              value={details}
              onChangeText={setDetails}
              multiline
              maxLength={500}
            />
          </View>
        )}

        <Pressable
          onPress={handleSubmit}
          className={`mt-6 py-4 rounded-xl items-center ${selectedReason ? 'bg-red-600' : 'bg-zinc-800'}`}
        >
          <Text className="text-white font-bold text-base">Submit Report</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
