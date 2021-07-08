import { JSONTryParse } from '../utils';
import { pick } from '../common/immutable';
import { PREFERENCES_LOAD, PREFERENCE_CHANGE } from '../constants/actions';
import { preferences as defaultPreferences, version } from '../constants/defaults';


// Prior to 0.11.13 we stored sorting order in uppercase, afterwards it's inline with Zotero API
const fixUpperCaseSort = oldPreferences => ({
	...oldPreferences,
	columns: oldPreferences.columns.map(column => {
		if('sort' in column) {
			return { ...column, sort: column.sort.toLowerCase() }
		} else {
			return column;
		}
	})
});

// Add missing "Added By" column, introduced in 0.12.0
const addAddedByColumn = oldPreferences => ({
	...oldPreferences,
	columns: [
		...oldPreferences.columns.slice(0, 9),
		defaultPreferences.columns[10],
		...oldPreferences.columns.slice(9)
	]
});

const preferencesLoad = () => {
	var userPreferences = JSONTryParse(localStorage.getItem('zotero-web-library-prefs'));
	var preferences;
	try {
		if(userPreferences && userPreferences.version !== version) {
			if(
				!('version' in userPreferences) && // we didn't store version in localStorage prior to 0.12.0
				userPreferences.columns.length === 11 && // ensure that columns are as expected
				typeof(userPreferences.columns.find(c => c.field === 'createdByUser')) === 'undefined'
			)  {
				userPreferences = {
					...addAddedByColumn(fixUpperCaseSort(userPreferences)),
					version
				}
			}
		}
		preferences = { ...defaultPreferences,...userPreferences };
	} catch(e) {
		console.error('Preferences from localStorage appear to be corrupted.');
		preferences = { ...defaultPreferences };
	}

	return {
		type: PREFERENCES_LOAD,
		preferences
	};
}

const preferenceChange = (name, value) => {
	return async (dispatch) => {
		await (new Promise(resolve => {
			setTimeout(() => {
				const preferences = {
					...defaultPreferences,
					...JSONTryParse(localStorage.getItem('zotero-web-library-prefs')),
					[name]: value,
					version
				};

				localStorage.setItem('zotero-web-library-prefs', JSON.stringify(preferences));
				resolve();
			}, 0)
		}));

		return dispatch({
			type: PREFERENCE_CHANGE,
			name,
			value
		});
	}
}

const restoreColumnsOrder = () => {
	return async (dispatch, getState) => {
		const userColumns = getState().preferences.columns;
		const columns = defaultPreferences.columns.map(defaultColumn => ({
			...defaultColumn,
			fraction: (userColumns.find(uc => uc.field === defaultColumn.field) || defaultColumn).fraction,
			isVisible: (userColumns.find(uc => uc.field === defaultColumn.field) || defaultColumn).isVisible,
		}));

		await dispatch(preferenceChange('columns', columns));
	}
}

const addCitationStyle = ({ name, title} = {}) => {
	return async (dispatch, getState) => {


		const newInstalledCitationStyles = [
			...(getState().preferences.installedCitationStyles || []),
			{ name, title }
		];

		return await dispatch(preferenceChange('installedCitationStyles', newInstalledCitationStyles));
	}
}

const deleteCitationStyle = styleName => {
	return async (dispatch, getState) => {

		const newInstalledCitationStyles = (getState().preferences.installedCitationStyles || []).filter(
			c => c.name !== styleName
		);

		return await dispatch(preferenceChange('installedCitationStyles', newInstalledCitationStyles));
	}
}

export {
	addCitationStyle,
	deleteCitationStyle,
	preferenceChange,
	preferencesLoad,
	restoreColumnsOrder,
};
