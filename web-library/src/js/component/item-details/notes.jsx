import cx from 'classnames';
import Dropdown from 'reactstrap/lib/Dropdown';
import DropdownItem from 'reactstrap/lib/DropdownItem';
import DropdownMenu from 'reactstrap/lib/DropdownMenu';
import DropdownToggle from 'reactstrap/lib/DropdownToggle';
import PropTypes from 'prop-types';
import React, { memo, forwardRef, useCallback, useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Button from '../ui/button';
import Icon from '../ui/icon';
import RichEditor from '../../component/rich-editor';

import { get, scrollIntoViewIfNeeded } from '../../utils';
import { isTriggerEvent } from '../../common/event';
import { noteAsTitle, pluralize } from '../../common/format';
import { getScrollContainerPageCount, noop, sortByKey, stopPropagation } from '../../utils';
import { TabPane } from '../ui/tabs';
import { Toolbar, ToolGroup } from '../ui/toolbars';
import { useFetchingState, useFocusManager, usePrevious } from '../../hooks';
import { deleteItem, createItem, updateItem, fetchChildItems, fetchItemTemplate, moveToTrash,
navigate, sourceFile } from '../../actions';

const PAGE_SIZE = 100;

const Note = memo(forwardRef((props, ref) => {
	const dispatch = useDispatch();
	const isTouchOrSmall = useSelector(state => state.device.isTouchOrSmall);
	const { isReadOnly, noteKey, onDelete, onDuplicate, onSelect, onKeyDown } = props;
	const [isDropdownOpen, setDropdownOpen] = useState(false);
	const note = useSelector(state => get(state, ['libraries', state.current.libraryKey, 'items', noteKey], {}));
	const isSelected = useSelector(state => noteKey === state.current.noteKey);
	const isUpdating = useSelector(state => noteKey in get(state, ['libraries', state.current.libraryKey, 'updating', 'items'], {}));
	const wasSelected = usePrevious(isSelected);

	useEffect(() => {
		if(!isSelected && wasSelected && !isUpdating && note.note === '') {
			onDelete(note, true);
		}
	}, [isSelected, wasSelected, isUpdating, note, onDelete]);

	const handleToggleDropdown = useCallback(
		() => setDropdownOpen(!isDropdownOpen), [isDropdownOpen]
	);

	const handleSelect = useCallback(ev => {
		if(isTriggerEvent(ev)) { onSelect(note) }
	}, [note, onSelect]);

	const handleDelete = useCallback(ev => {
		onDelete(note);
		ev.stopPropagation();
	}, [note, onDelete]);

	const handleDuplicate = useCallback(ev => {
		onDuplicate(note);
		ev.stopPropagation();
	}, [note, onDuplicate]);

	const handleFocus = useCallback(ev => {
		if(ev.target !== ev.currentTarget) {
			return;
		}
		if(isTouchOrSmall) {
			return;
		}

		dispatch(navigate({ noteKey: note.key, attachmentKey: null }));
	}, [dispatch, isTouchOrSmall, note]);

	const handleKeyDown = useCallback(ev => {
		if(ev.key === 'Escape' && isDropdownOpen) {
			// Escape should not move focus back to the list in this case
			ev.stopPropagation();
		}
		onKeyDown(ev);
	}, [isDropdownOpen, onKeyDown]);

	return (
		<li
			className={ cx('note', { 'selected': isSelected }) }
			onClick={ handleSelect }
			onKeyDown={ handleKeyDown }
			tabIndex={ -2 }
			data-key={ note.key }
			ref={ ref }
			onFocus={ handleFocus }
		>
			<Icon type={ '28/item-types/light/note'} width="28" height="28" className="hidden-mouse" />
			<div className="multiline-truncate">
				{ note.note && noteAsTitle(note.note) || <em>Untitled Note</em> }
			</div>
			{ !isReadOnly && (
				<Dropdown
					isOpen={ isDropdownOpen }
					toggle={ handleToggleDropdown }
				>
					<DropdownToggle
						color={ null }
						tabIndex={ -3 }
						onClick={ stopPropagation }
						className={ cx('dropdown-toggle', {
							'btn-circle btn-secondary': isTouchOrSmall,
							'btn-icon': !isTouchOrSmall,
						})}
					>
						<Icon
							type={ '16/options-strong' }
							width="16"
							height="16"
							className="touch"
						/>
						<Icon type={ '16/options' } width="16" height="16" className="mouse" />
					</DropdownToggle>
					<DropdownMenu right>
						<DropdownItem onClick={ handleDuplicate }>
							Duplicate
						</DropdownItem>
						<DropdownItem onClick={ handleDelete }>
							Delete
						</DropdownItem>
					</DropdownMenu>
				</Dropdown>
			)}
			<Icon type={ '16/chevron-13' } width="16" height="16" className="hidden-mouse" />
		</li>
	);
}));

Note.displayName = 'Note';

Note.propTypes = {
	isReadOnly: PropTypes.bool,
	isSelected: PropTypes.bool,
	noteKey: PropTypes.string,
	onDelete: PropTypes.func,
	onDuplicate: PropTypes.func,
	onKeyDown: PropTypes.func,
	onSelect: PropTypes.func,
}

const Notes = ({ isActive, isReadOnly }) => {
	const dispatch = useDispatch();
	const libraryKey = useSelector(state => state.current.libraryKey);
	const noteKey = useSelector(state => state.current.noteKey);
	const prevNoteKey = usePrevious(noteKey);
	const itemKey = useSelector(state => state.current.itemKey);
	const { isFetching, isFetched, pointer, keys } = useFetchingState(
		['libraries', libraryKey, 'itemsByParent', itemKey]
	);

	const allItems = useSelector(state => state.libraries[libraryKey].items);
	const shouldUseTabs = useSelector(state => state.device.shouldUseTabs);
	const isTouchOrSmall = useSelector(state => state.device.isTouchOrSmall);
	const isTinymceFetching = useSelector(state => state.sources.fetching.includes('tinymce'));
	const isTinymceFetched = useSelector(state => state.sources.fetched.includes('tinymce'));
	const notes = (keys || [])
		.map(childItemKey => allItems[childItemKey])
		.filter(item => !item.deleted && item.itemType === 'note');

	sortByKey(notes, n => noteAsTitle(n.note));

	const editorRef = useRef();
	const addedNoteKey = useRef();
	const notesEl = useRef(null);
	const selectedNoteRef = useRef(null);
	const addNoteRef = useRef(null);
	const hasScrolledIntoViewRef = useRef(false);
	const noteKeyToAutoDelete = useRef(null);

	const { focusNext, focusPrev, focusDrillDownNext, focusDrillDownPrev, receiveFocus,
		receiveBlur, resetLastFocused,focusBySelector } = useFocusManager(notesEl, '.note.selected', false);

	const selectedNote = notes.find(n => n && n.key === noteKey);

	const handleEditNote = useCallback(() => {
		noteKeyToAutoDelete.current = null;
	}, []);

	const handleChangeNote = useCallback((newContent, key) => {
		noteKeyToAutoDelete.current = null;
		dispatch(updateItem(key, { note: newContent }));
	}, [dispatch]);

	const handleSelect = useCallback(note => {
		hasScrolledIntoViewRef.current = true;
		focusBySelector(`[data-key="${note.key}"]`);
		dispatch(navigate({ noteKey: note.key, attachmentKey: null }));
	}, [dispatch, focusBySelector]);

	const handleDelete = useCallback((note, isAutoDelete = false) => {
		if(note.key === noteKeyToAutoDelete.current && !isAutoDelete) {
			// prevent deletion from happening twice
			noteKeyToAutoDelete.current = null;
		}
		if(isAutoDelete && noteKeyToAutoDelete.current === note.key) {
			dispatch(deleteItem(note));
			noteKeyToAutoDelete.current = null;
		} else if(!isAutoDelete) {
			dispatch(moveToTrash([note.key]));
			if(note.key === noteKey) {
				dispatch(navigate({ noteKey: null, attachmentKey: null }));
			}
		}
	}, [dispatch, noteKey]);

	const handleDuplicate = useCallback(async note => {
		const noteTemplate = await dispatch(fetchItemTemplate('note'));
		const item = { ...noteTemplate, parentItem: itemKey, note: note.note };
		const createdItem = await dispatch(createItem(item, libraryKey));
		addedNoteKey.current = createdItem.key;
		dispatch(navigate({ noteKey: createdItem.key, attachmentKey: null }));
	}, [dispatch, itemKey, libraryKey]);

	const handleAddNote = useCallback(async () => {
		const noteTemplate = await dispatch(fetchItemTemplate('note'));
		const item = { ...noteTemplate, parentItem: itemKey, note: '' };
		const createdItem = await dispatch(createItem(item, libraryKey));
		addedNoteKey.current = createdItem.key;
		noteKeyToAutoDelete.current = createdItem.key;
		dispatch(navigate({ noteKey: createdItem.key, attachmentKey: null }));
	}, [dispatch, itemKey, libraryKey]);

	const handleKeyDown = useCallback(ev => {
		if(ev.key === "ArrowLeft") {
			focusDrillDownPrev(ev);
		} else if(ev.key === "ArrowRight") {
			focusDrillDownNext(ev);
		} else if(ev.key === 'ArrowDown') {
			ev.target === ev.currentTarget && focusNext(ev);
		} else if(ev.key === 'ArrowUp') {
			ev.target === ev.currentTarget && focusPrev(ev, { targetEnd: addNoteRef.current });
		} else if(ev.key === 'Home') {
			addNoteRef.current.focus();
			ev.preventDefault();
		} else if(ev.key === 'End') {
			focusBySelector('.note:last-child');
			ev.preventDefault();
		} else if(ev.key === 'PageDown' && notesEl.current) {
			const containerEl = notesEl.current;
			const itemEl = containerEl.querySelector('.note');
			focusNext(ev, { offset: getScrollContainerPageCount(itemEl, containerEl) });
			ev.preventDefault();
		} else if(ev.key === 'PageUp' && notesEl.current) {
			const containerEl = notesEl.current;
			const itemEl = containerEl.querySelector('.note');
			focusPrev(ev, { offset: getScrollContainerPageCount(itemEl, containerEl) });
			ev.preventDefault();
		} else if(ev.key === 'Tab') {
			const isFileInput = ev.currentTarget === addNoteRef.current;
			const isShift = ev.getModifierState('Shift');
			if(isFileInput && !isShift) {
				ev.target === ev.currentTarget && focusNext(ev);
			}
		} else if(isTriggerEvent(ev)) {
			ev.target.click();
			ev.preventDefault();
		}
	}, [focusBySelector, focusDrillDownNext, focusDrillDownPrev, focusNext, focusPrev]);

	const handleButtonKeyDown = useCallback(ev => {
		if(ev.key === 'ArrowDown') {
			notesEl.current.focus();
			ev.preventDefault();
		} else if(ev.key === 'End') {
			focusBySelector('.note:last-child');
			ev.preventDefault();
		}
	}, [focusBySelector]);

	useEffect(() => {
		if(!isTinymceFetched && !isTinymceFetching) {
			dispatch(sourceFile('tinymce'));
		}
	}, [dispatch, isTinymceFetching, isTinymceFetched]);

	useEffect(() => {
		if(isActive && !isFetching && !isFetched) {
			const start = pointer || 0;
			const limit = PAGE_SIZE;
			dispatch(fetchChildItems(itemKey, { start, limit }));
		}
	}, [dispatch, itemKey, isActive, isFetching, isFetched, pointer]);

	useEffect(() => {
		if(!isTouchOrSmall && isActive && noteKey && editorRef.current && addedNoteKey.current === noteKey) {
			editorRef.current.focus();
			focusBySelector(`[data-key="${noteKey}"]`);
			addedNoteKey.current = null;
		}
	}, [focusBySelector, isActive, isTouchOrSmall, noteKey, notes]);

	useEffect(() => {
		if(!isTouchOrSmall && prevNoteKey !== noteKey && noteKey === null) {
			resetLastFocused();
			if(notesEl && notesEl.current) {
				// When note has been deleted, keep focus within the the list by focusing on either
				// first or second note (if first is being deleted) in the list
				focusBySelector(`.note:first-child:not([data-key="${prevNoteKey}"]), .note:nth-child(2)`);
			}
		}
	}, [focusBySelector, noteKey, isTouchOrSmall, resetLastFocused, prevNoteKey, receiveBlur]);

	// Scroll selected note into view when it's first ready.
	useEffect(() => {
		setTimeout(() => {
			if(!notesEl.current || !selectedNote) {
				return;
			}

			const selectedNoteEl = notesEl.current.querySelector(`[data-key="${selectedNote.key}"]`);

			if(selectedNoteEl && !hasScrolledIntoViewRef.current) {
				scrollIntoViewIfNeeded(selectedNoteEl, notesEl.current);
				hasScrolledIntoViewRef.current = true;
			}
		}, 0);
	}, [selectedNote]);

	return (
		<TabPane
			className="notes"
			isActive={ isActive }
			isLoading={ shouldUseTabs && !isFetched }
		>
			<h5 className="h2 tab-pane-heading hidden-mouse">Notes</h5>
			{ !isTouchOrSmall && (
				<Toolbar>
					<div className="toolbar-left">
						<div className="counter">
							{ `${notes.length} ${pluralize('note', notes.length)}` }
						</div>
						{ !isReadOnly && (
						<ToolGroup>
							<Button
								className="btn-default"
								disabled={ isReadOnly }
								onClick={ handleAddNote }
								onKeyDown={ handleButtonKeyDown }
								ref={ addNoteRef }
								tabIndex="0"
							>
								Add Note
							</Button>
						</ToolGroup>
						) }
					</div>
				</Toolbar>
			)}
			<div
				className="scroll-container-mouse"
				onBlur={ isTouchOrSmall ? noop : receiveBlur }
				onFocus={ isTouchOrSmall ? noop : receiveFocus }
				ref={ notesEl }
				tabIndex={ 0 }
			>
				{ notes.length > 0 && (
					<nav>
						<ul className="note-list" >
							{
								notes.map(note => {
									return (
										<Note
											isReadOnly={ isReadOnly }
											key={ note.key }
											noteKey={ note.key }
											onDelete={ handleDelete }
											onDuplicate={ handleDuplicate }
											onSelect={ handleSelect }
											onKeyDown={ handleKeyDown }
											ref={ noteKey === note.key ? selectedNoteRef : null }
										/>
									);
								})
							}
						</ul>
					</nav>
				) }
			</div>
			{ isTouchOrSmall && !isReadOnly && (
				<Button
					onClick={ handleAddNote }
					className="btn-block text-left hairline-top hairline-start-icon-28 btn-transparent-secondary"
				>
					<Icon type={ '24/plus-circle-strong' } width="24" height="24" />
					Add Note
				</Button>
			)}

			{ !isTouchOrSmall && selectedNote && (
				<RichEditor
					id={ noteKey }
					isReadOnly={ isReadOnly }
					onChange={ handleChangeNote }
					onEdit={ handleEditNote }
					ref={ editorRef }
					value={ selectedNote.note }
				/>
			) }
			{ !isTouchOrSmall && !selectedNote && notes.length > 0 && (
				<div className="no-selection-placeholder">
					No note selected
				</div>
			) }
		</TabPane>
	);
}

Notes.propTypes = {
	isActive: PropTypes.bool,
	isReadOnly: PropTypes.bool,
}

export default memo(Notes);
