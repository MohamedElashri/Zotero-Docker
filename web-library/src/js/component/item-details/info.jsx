import React, { memo, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import PropTypes from 'prop-types';
import cx from 'classnames';

import ItemBox from './box';
import Abstract from './abstract';
import { getBaseMappedValue } from '../../common/item';
import { TabPane } from '../ui/tabs';
import { fetchItemTypeCreatorTypes, fetchItemTypeFields } from '../../actions';
import { get } from '../../utils';
import { usePrevious } from '../../hooks';

const Info = ({ isActive, isReadOnly }) => {
	const dispatch = useDispatch();
	const isLibraryReadOnly = useSelector(
		state => (state.config.libraries.find(l => l.key === state.current.libraryKey) || {}).isReadOnly
	);
	const itemType = useSelector(state =>
		get(state, ['libraries', state.current.libraryKey, 'items', state.current.itemKey, 'itemType'])
	);
	const abstractNote = useSelector(state =>
		get(state, ['libraries', state.current.libraryKey, 'items', state.current.itemKey, 'abstractNote'])
	);
	const title = useSelector(state =>
		getBaseMappedValue(get(state, ['libraries', state.current.libraryKey, 'items', state.current.itemKey], {}), 'title')
	);
	const isMetaAvailable = useSelector(
		state => itemType && itemType in state.meta.itemTypeCreatorTypes && itemType in state.meta.itemTypeFields
	);
	const isEditing = useSelector(
		state => state.current.itemKey && state.current.editingItemKey === state.current.itemKey
	);
	const shouldFetchMeta = useSelector(state => !isMetaAvailable
		&& !state.fetching.itemTypeCreatorTypes.includes(itemType)
		&& !state.fetching.itemTypeFields.includes(itemType)
	);
	const prevShouldFetchMeta = usePrevious(shouldFetchMeta);

	useEffect(() => {
		if(shouldFetchMeta && !prevShouldFetchMeta) {
			dispatch(fetchItemTypeCreatorTypes(itemType));
			dispatch(fetchItemTypeFields(itemType));
		}
	}, [dispatch, itemType, prevShouldFetchMeta, shouldFetchMeta]);

	return (
		<TabPane
			className="info"
			isActive={ isActive }
			isLoading={ !isMetaAvailable }
		>
			<div className="scroll-container-mouse">
				<div className="row">
					<div className="col">
						{ !isEditing && (
								<h5 className={ cx(
									'h1','item-title', {
										placeholder: title.length === 0
									}
								)}>
									{ title.length === 0 ? 'Untitled' : title }
								</h5>
							)
						}
						<ItemBox
							isActive={ isActive }
							isReadOnly={ isReadOnly }
							hiddenFields={ [ 'abstractNote' ] }
						/>
					</div>
					{ (!isLibraryReadOnly || abstractNote) && (
						<div className="col">
							<section className={ cx({
								'empty-abstract': !abstractNote,
								abstract: true,
								editing: isEditing,
							}) }>
								<h6 className="h2 abstract-heading">
									Abstract
								</h6>
								<div className="abstract-body">
									<Abstract isReadOnly={ isReadOnly } />
								</div>
							</section>
						</div>
					) }
				</div>
			</div>
		</TabPane>
	);
}

Info.propTypes = {
	isActive: PropTypes.bool,
	isReadOnly: PropTypes.bool,
}

export default memo(Info);

