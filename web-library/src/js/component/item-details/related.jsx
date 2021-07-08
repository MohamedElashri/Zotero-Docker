import PropTypes from 'prop-types';
import React, { memo, useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Button from '../ui/button';
import Icon from '../ui/icon';
import { fetchRelatedItems, navigate, removeRelatedItem } from '../../actions';
import { getItemTitle } from '../../common/item';
import { get, getScrollContainerPageCount, getUniqueId, mapRelationsToItemKeys, noop,
sortItemsByKey, } from '../../utils';
import { isTriggerEvent } from '../../common/event';
import { TabPane } from '../ui/tabs';
import { useFocusManager } from '../../hooks';


const RelatedItem = memo(props => {
	const { parentItemKey, relatedItem, onKeyDown } = props;
	const dispatch = useDispatch();
	const libraryKey = useSelector(state => state.current.libraryKey);
	const isTouchOrSmall = useSelector(state => state.device.isTouchOrSmall);
	const iconSize = isTouchOrSmall ? '28' : '16';
	const id = useRef(getUniqueId());

	const handleSelect = useCallback(ev => {
		const relatedItemKey = ev.currentTarget.closest('[data-key]').dataset.key;
		dispatch(navigate({
			library: libraryKey,
			items: relatedItemKey
		}, true));
	}, [dispatch, libraryKey]);

	const handleDelete = useCallback(ev => {
		const relatedItemKey = ev.currentTarget.closest('[data-key]').dataset.key;
		dispatch(removeRelatedItem(parentItemKey, relatedItemKey));
	}, [dispatch, parentItemKey]);

	const getItemIcon = item => {
		const { iconName } = item[Symbol.for('derived')];
		const dvp = window.devicePixelRatio >= 2 ? 2 : 1;
		return isTouchOrSmall ?
			`28/item-types/light/${iconName}` : `16/item-types/light/${dvp}x/${iconName}`;
	}

	return (
			<li
				aria-labelledby={ id.current }
				className="related"
				data-key={ relatedItem.key }
				key={ relatedItem.key }
				onKeyDown={ onKeyDown }
				role="listitem button"
				tabIndex={ -2 }
			>
				<Icon
					type={ getItemIcon(relatedItem) }
					width={ iconSize }
					height={ iconSize }
				/>
				<a id={ id.current } onClick={ handleSelect }>
					{ getItemTitle(relatedItem) }
				</a>
				<Button icon
					aria-label="remove related"
					onClick={ handleDelete }
					tabIndex={ -3 }
				>
					<Icon type={ '16/minus-circle' } width="16" height="16" />
				</Button>
			</li>
		)
});

RelatedItem.displayName = 'RelatedItem';

RelatedItem.propTypes = {
	parentItemKey: PropTypes.string,
	relatedItem: PropTypes.object,
	onKeyDown: PropTypes.func,
}

const Related = ({ isActive }) => {
	const dispatch = useDispatch();
	const shouldUseTabs = useSelector(state => state.device.shouldUseTabs);
	const libraryKey = useSelector(state => state.current.libraryKey);
	const itemKey = useSelector(state => state.current.itemKey);
	const item = useSelector(state => get(state, ['libraries', libraryKey, 'items', itemKey], {}));
	const relations = item.relations;
	const relatedKeys = mapRelationsToItemKeys(relations || {}, libraryKey);
	const isFetching = useSelector(state => get(state, ['libraries', libraryKey, 'itemsRelated', itemKey, 'isFetching'], false));
	const isFetched = useSelector(state => get(state, ['libraries', libraryKey, 'itemsRelated', itemKey, 'isFetched'], false));
	const allItems = useSelector(state => state.libraries[libraryKey].items);
	const isTouchOrSmall = useSelector(state => state.device.isTouchOrSmall);
	const relatedItems = (relatedKeys || [])
		.map(relatedKey => allItems[relatedKey])
		.filter(Boolean);

	const sortedRelatedItems = [...relatedItems];
	sortItemsByKey(sortedRelatedItems, 'title');

	const scrollContainerRef = useRef(null);
	const { receiveBlur, focusDrillDownPrev, focusDrillDownNext, receiveFocus, focusNext,
		focusPrev } = useFocusManager(scrollContainerRef, null, false);

	const handleKeyDown = useCallback(ev => {
		if(ev.key === "ArrowLeft") {
			focusDrillDownPrev(ev);
		} else if(ev.key === "ArrowRight") {
			focusDrillDownNext(ev);
		} else if(ev.key === 'ArrowDown') {
			ev.target === ev.currentTarget && focusNext(ev);
		} else if(ev.key === 'ArrowUp') {
			ev.target === ev.currentTarget && focusPrev(ev);
		} else if(ev.key === 'Home' && scrollContainerRef.current) {
			focusPrev(ev, { offset: Infinity });
			ev.preventDefault();
		} else if(ev.key === 'End' && scrollContainerRef.current) {
			focusNext(ev, { offset: Infinity });
			ev.preventDefault();
		} else if(ev.key === 'PageDown' && scrollContainerRef.current) {
			const containerEl = scrollContainerRef.current;
			const itemEl = containerEl.querySelector('.related');
			focusNext(ev, { offset: getScrollContainerPageCount(itemEl, containerEl) });
			ev.preventDefault();
		} else if(ev.key === 'PageUp' && scrollContainerRef.current) {
			const containerEl = scrollContainerRef.current;
			const itemEl = containerEl.querySelector('.related');
			focusPrev(ev, { offset: getScrollContainerPageCount(itemEl, containerEl) });
			ev.preventDefault();
		} else if(isTriggerEvent(ev)) {
			ev.target.querySelector('a').click();
			ev.preventDefault();
		}
	}, [focusDrillDownNext, focusDrillDownPrev, focusNext, focusPrev]);

		useEffect(() => {
		if(!isFetching && !isFetched) {
			dispatch(fetchRelatedItems(itemKey));
		}
	}, [dispatch, isFetching, isFetched, itemKey]);

	return (
		<TabPane isActive={ isActive } isLoading={ shouldUseTabs && !isFetched }>
			<h5 className="h2 tab-pane-heading hidden-mouse">Related</h5>
			<div
				className="scroll-container-mouse"
				onBlur={ isTouchOrSmall ? noop : receiveBlur }
				onFocus={ isTouchOrSmall ? noop : receiveFocus }
				ref={ scrollContainerRef }
				tabIndex={ 0 }
			>
				{ sortedRelatedItems.length > 0 && (
					<nav>
						<ul className="details-list related-list">
							{
								sortedRelatedItems.map(relatedItem => (
									<RelatedItem
										key={ relatedItem.key }
										parentItemKey={ itemKey }
										relatedItem={ relatedItem }
										onKeyDown={ handleKeyDown }
									/>
								))
							}
						</ul>
					</nav>
				) }
			</div>
		</TabPane>
	);
}

Related.propTypes = {
	isActive: PropTypes.bool
}

export default memo(Related);
