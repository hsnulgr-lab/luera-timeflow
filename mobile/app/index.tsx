import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { authApi, type LaunchState } from '../src/api/session';
import { useTheme } from '../src/theme';

export default function Index() {
    const { c } = useTheme();
    const [launch, setLaunch] = useState<LaunchState | null>(null);

    useEffect(() => {
        let alive = true;
        authApi.getLaunchState().then((next) => {
            if (alive) setLaunch(next);
        });
        return () => { alive = false; };
    }, []);

    if (!launch) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
    if (launch.target === 'resume') return <Redirect href="/(auth)/resume" />;
    if (launch.target === 'staffRoster') return <Redirect href="/(auth)/staff/who" />;
    return <Redirect href="/(auth)/welcome" />;
}
