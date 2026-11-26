import { Head } from '@inertiajs/react';
import Heading from '@/components/heading';
import { LanguageSelect } from '@/components/language-select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    useCarryOverSetting,
    useCompactDensity,
    useStripedRows,
    useTodayColor,
} from '@/hooks/use-carry-over-setting';
import { TaskColorSwatch } from '@/components/planner/task-color-swatch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { TASK_COLORS } from '@/lib/db/types';
import { TASK_COLOR_STYLES, isTaskColor } from '@/lib/planner/task-colors';
import { availableLocales, t } from '@/lib/i18n';
import {
    compactDensity,
    stripedRows,
    todayColor,
} from '@/lib/planner/device-settings';
import { carryOverSetting } from '@/lib/planner/preferences';

/**
 * Settings › Preferences: planner behaviour, whose values live in this
 * browser (per device) so they apply offline and need no server, and the
 * interface language, which belongs to the account (emails and push
 * notifications use it too). The language section only shows when the
 * instance offers more than English.
 */
export default function Preferences() {
    const carryOver = useCarryOverSetting();
    const compact = useCompactDensity();
    const stripes = useStripedRows();
    const today = useTodayColor();

    return (
        <>
            <Head title={t('preferences.title')} />

            <h1 className="sr-only">{t('preferences.title')}</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title={t('preferences.plannerHeading')}
                    description={t('preferences.plannerDescription')}
                />
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="carry-over">
                            {t('preferences.carryOverLabel')}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            {t('preferences.carryOverDescription')}
                        </p>
                    </div>
                    <Switch
                        id="carry-over"
                        checked={carryOver}
                        onCheckedChange={carryOverSetting.setEnabled}
                        data-test="carry-over-switch"
                    />
                </div>
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="compact-rows">
                            {t('preferences.compactLabel')}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            {t('preferences.compactDescription')}
                        </p>
                    </div>
                    <Switch
                        id="compact-rows"
                        checked={compact}
                        onCheckedChange={compactDensity.set}
                        data-test="compact-switch"
                    />
                </div>
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="striped-rows">
                            {t('preferences.stripesLabel')}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            {t('preferences.stripesDescription')}
                        </p>
                    </div>
                    <Switch
                        id="striped-rows"
                        checked={stripes}
                        onCheckedChange={stripedRows.set}
                        data-test="stripes-switch"
                    />
                </div>
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="today-color">
                            {t('preferences.todayColorLabel')}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            {t('preferences.todayColorDescription')}
                        </p>
                    </div>
                    <Select
                        value={today}
                        onValueChange={(value) => {
                            if (isTaskColor(value)) {
                                todayColor.set(value);
                            }
                        }}
                    >
                        <SelectTrigger
                            id="today-color"
                            className="w-44 shrink-0"
                            data-test="today-color"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {TASK_COLORS.map((color) => (
                                <SelectItem key={color} value={color}>
                                    <TaskColorSwatch
                                        color={color}
                                        checked={false}
                                    />
                                    {color === 'none'
                                        ? t('preferences.todayColorDefault')
                                        : TASK_COLOR_STYLES[color].label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {availableLocales().length > 1 && (
                <div className="space-y-6">
                    <Heading
                        variant="small"
                        title={t('preferences.languageHeading')}
                        description={t('preferences.languageDescription')}
                    />
                    <LanguageSelect />
                </div>
            )}
        </>
    );
}
