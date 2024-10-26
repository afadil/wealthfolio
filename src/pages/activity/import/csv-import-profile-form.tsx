import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { CsvImportProfile } from '@/lib/types';

interface CsvImportProfileFormProps {
    onSuccess: () => void;
  }

const CsvImportProfileForm: React.FC<CsvImportProfileFormProps> = ({ onSuccess }) => {
  const [profileName, setProfileName] = useState('');
  const queryClient = useQueryClient();

  const createProfileMutation = useMutation<void, Error, CsvImportProfile>({
    mutationFn: (profile: CsvImportProfile) => invoke<void>('create_csv_import_profile', { profile }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['csv-import-profiles'] });
      onSuccess(); // Call the prop function if needed
    },
    onError: (error: Error) => {
      console.error('Error creating profile:', error);
    },
  });  

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    createProfileMutation.mutate({
      id: crypto.randomUUID(), // Generate a random UUID for the profile
      name: profileName,
      account_id: 'some-account-id', // Replace with actual account ID
      column_mappings: [], // Initially empty mappings
      transaction_type_mappings: [], // Initially empty mappings
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={profileName}
        onChange={(e) => setProfileName(e.target.value)}
        placeholder="Profile Name"
      />
      <button type="submit">Create Profile</button>
    </form>
  );
};

export default CsvImportProfileForm;
